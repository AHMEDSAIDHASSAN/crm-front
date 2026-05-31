import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma, LeadType } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { CreateDataBatchDto } from './dto/create-data-batch.dto';
import { UpdateDataBatchDto } from './dto/update-data-batch.dto';

@Injectable()
export class DataBatchesService {
  private readonly logger = new Logger(DataBatchesService.name);

  constructor(private prisma: PrismaService) { }

  private isDuplicateMysqlAlterError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      msg.includes('Duplicate column') ||
      msg.includes('1060') ||
      msg.includes('Duplicate key name') ||
      msg.includes('1061') ||
      msg.includes('check that column/key exists') ||
      msg.includes('Duplicate foreign key') ||
      msg.includes('1826') ||
      msg.includes('already exists')
    );
  }

  /** Best-effort DDL so dev DBs work without manual migrate (needs ALTER on `data_batches`). */
  private async ensureDataBatchesSchemaPatches(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        'ALTER TABLE `data_batches` ADD COLUMN `campaign_id` BIGINT NULL',
      );
      this.logger.log('Added data_batches.campaign_id');
    } catch (e) {
      if (!this.isDuplicateMysqlAlterError(e)) throw e;
    }
    try {
      await this.prisma.$executeRawUnsafe(
        'ALTER TABLE `data_batches` ADD INDEX `idx_data_batch_campaign` (`campaign_id`)',
      );
    } catch (e) {
      if (!this.isDuplicateMysqlAlterError(e)) {
        this.logger.warn(`data_batches index idx_data_batch_campaign: ${e instanceof Error ? e.message : e}`);
      }
    }
    try {
      await this.prisma.$executeRawUnsafe(
        'ALTER TABLE `data_batches` ADD CONSTRAINT `data_batches_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
      );
    } catch (e) {
      if (!this.isDuplicateMysqlAlterError(e)) {
        this.logger.warn(`data_batches FK campaign_id: ${e instanceof Error ? e.message : e}`);
      }
    }

    const importCols: [string, string][] = [
      ['imported_count', 'INT NOT NULL DEFAULT 0'],
      ['skipped_duplicate_count', 'INT NOT NULL DEFAULT 0'],
      ['failed_import_count', 'INT NOT NULL DEFAULT 0'],
    ];
    for (const [col, def] of importCols) {
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE \`data_batches\` ADD COLUMN \`${col}\` ${def}`,
        );
        this.logger.log(`Added data_batches.${col}`);
      } catch (e) {
        if (!this.isDuplicateMysqlAlterError(e)) throw e;
      }
    }
  }

  /**
   * Prisma P2022 often says only "The column `campaign_id` does not exist in the current database"
   * with no `data_batches` substring — so match column names / meta (this service only talks to DataBatch).
   */
  private isDataBatchMissingColumnP2022(e: unknown): boolean {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2022') return false;
    const m = e.message;
    const col = String((e.meta as { column?: string } | undefined)?.column ?? '');
    if (col.includes('leads.') && col.includes('campaign_id')) return false;
    return (
      col.includes('data_batches') ||
      m.includes('campaign_id') ||
      m.includes('imported_count') ||
      m.includes('skipped_duplicate_count') ||
      m.includes('failed_import_count')
    );
  }

  /**
   * When `campaign_id` / import stat columns are missing in MySQL, Prisma `create` fails (P2022).
   * Cold-call batches can still be created with a minimal INSERT; campaign-linked batches need migration.
   */
  private async createLegacyDataBatchRow(dto: CreateDataBatchDto) {
    if (dto.campaignId != null) {
      throw new BadRequestException(
        'Could not add data_batches.campaign_id automatically (database user may lack ALTER privilege). Run prisma/migrations/20260412150000_data_batch_campaign_id/migration.sql manually.',
      );
    }

    this.logger.warn(
      'Creating data_batch via legacy SQL — run pending Prisma migrations so campaign_id and import columns exist.',
    );

    const purchaseDate = dto.purchaseDate ? new Date(dto.purchaseDate) : null;
    const purchasePrice =
      dto.purchasePrice !== undefined && dto.purchasePrice !== null && String(dto.purchasePrice).trim() !== ''
        ? Number(dto.purchasePrice)
        : null;

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO data_batches (
          batch_name, data_source, purchase_date, purchase_price, total_records, quality, notes, created_by
        ) VALUES (
          ${dto.batchName},
          ${dto.dataSource},
          ${purchaseDate},
          ${purchasePrice},
          ${dto.totalRecords ?? 0},
          ${dto.quality ?? null},
          ${dto.notes ?? null},
          ${BigInt(dto.createdBy)}
        )
      `,
    );

    const idRow = await this.prisma.$queryRaw<{ id: bigint }[]>(
      Prisma.sql`SELECT LAST_INSERT_ID() AS id`,
    );
    const id = idRow[0]?.id;
    if (id == null) {
      throw new BadRequestException('Could not create data batch (LAST_INSERT_ID)');
    }

    return {
      id,
      batchName: dto.batchName,
      dataSource: dto.dataSource,
      purchaseDate,
      purchasePrice,
      totalRecords: dto.totalRecords ?? 0,
      quality: dto.quality ?? null,
      notes: dto.notes ?? null,
      createdBy: BigInt(dto.createdBy),
      campaignId: null,
      importedCount: 0,
      skippedDuplicateCount: 0,
      failedImportCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /** Aligns bulk / Excel batch metadata with import rules (see LeadsService.batchImport). */
  private validateDataBatchSourceRules(dto: CreateDataBatchDto): void {
    const ds = String(dto.dataSource ?? '').trim().toLowerCase();
    const rawCid = dto.campaignId;
    const cid =
      rawCid !== undefined && rawCid !== null && String(rawCid).trim() !== ''
        ? Number(rawCid)
        : NaN;
    if (ds === 'resale' && Number.isFinite(cid) && cid > 0) {
      throw new BadRequestException('Resale batches cannot be linked to a marketing campaign (omit campaignId).');
    }
  }

  async create(createDataBatchDto: CreateDataBatchDto) {
    const { campaignId, createdBy, purchasePrice, totalRecords, ...rest } = createDataBatchDto;
    this.validateDataBatchSourceRules(createDataBatchDto);

    const doCreate = () =>
      this.prisma.dataBatch.create({
        data: {
          ...rest,
          totalRecords: totalRecords ?? 0,
          createdBy: BigInt(createdBy),
          purchasePrice: purchasePrice != null ? Number(purchasePrice) : null,
          ...(campaignId != null && { campaignId: BigInt(campaignId) }),
        } as any,
      });

    try {
      return await doCreate();
    } catch (e) {
      if (!this.isDataBatchMissingColumnP2022(e)) throw e;
      try {
        await this.ensureDataBatchesSchemaPatches();
      } catch (alterErr) {
        this.logger.error(
          `Auto-migrate data_batches failed: ${alterErr instanceof Error ? alterErr.message : alterErr}`,
        );
        return this.createLegacyDataBatchRow(createDataBatchDto);
      }
      try {
        return await doCreate();
      } catch (e2) {
        if (this.isDataBatchMissingColumnP2022(e2)) {
          return this.createLegacyDataBatchRow(createDataBatchDto);
        }
        throw e2;
      }
    }
  }

  /**
   * Lists batches with creator, counts, and linked campaign (if any).
   * Does not use `include: { campaign }` so a slightly out-of-sync Prisma client
   * still works; `campaignId` is read from the row and campaigns are loaded in one extra query.
   */
  /**
   * When `campaign_id` was never migrated onto `data_batches`, Prisma still expects
   * that column and throws P2022. This path matches the normal API shape with
   * `campaign: null` and `campaignId: null`.
   */
  private async findAllWhenCampaignIdColumnMissing(): Promise<
    Array<Record<string, unknown> & { campaign: null }>
  > {
    this.logger.warn(
      'DB is missing data_batches.campaign_id. Run prisma/migrations/20260412150000_data_batch_campaign_id/migration.sql (or baseline migrate). Using raw SQL for GET /data-batches.',
    );

    type RawRow = {
      id: bigint;
      batch_name: string;
      data_source: string;
      purchase_date: Date | null;
      purchase_price: unknown;
      total_records: number;
      quality: string | null;
      notes: string | null;
      created_by: bigint;
      created_at: Date;
      updated_at: Date;
      creator_first_name: string | null;
      creator_last_name: string | null;
      lead_count: bigint | number;
    };

    const rows = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        db.id,
        db.batch_name,
        db.data_source,
        db.purchase_date,
        db.purchase_price,
        db.total_records,
        db.quality,
        db.notes,
        db.created_by,
        db.created_at,
        db.updated_at,
        u.first_name AS creator_first_name,
        u.last_name AS creator_last_name,
        COALESCE(
          (SELECT COUNT(*) FROM leads l WHERE l.data_batch_id = db.id),
          0
        ) AS lead_count
      FROM data_batches db
      LEFT JOIN users u ON u.id = db.created_by
      ORDER BY db.created_at DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      batchName: r.batch_name,
      dataSource: r.data_source,
      purchaseDate: r.purchase_date,
      purchasePrice: r.purchase_price,
      totalRecords: r.total_records,
      quality: r.quality,
      notes: r.notes,
      createdBy: r.created_by,
      campaignId: null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      creator: {
        id: r.created_by,
        firstName: r.creator_first_name ?? '',
        lastName: r.creator_last_name ?? '',
      },
      _count: { leads: Number(r.lead_count) },
      campaign: null,
      importedCount: 0,
      skippedDuplicateCount: 0,
      failedImportCount: 0,
    }));
  }

  async findAll(retriedAfterSchemaPatch = false) {
    try {
      const rows = await this.prisma.dataBatch.findMany({
        include: {
          creator: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: { select: { leads: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      type RowWithCampaignId = (typeof rows)[number] & { campaignId?: bigint | null };
      const ids = [
        ...new Set(
          rows
            .map((r) => (r as RowWithCampaignId).campaignId)
            .filter((id): id is bigint => id != null)
            .map((id) => id.toString()),
        ),
      ].map((s) => BigInt(s));

      const campaigns =
        ids.length > 0
          ? await this.prisma.campaign.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true, platform: true, platformLabel: true },
            })
          : [];

      const campaignById = new Map(campaigns.map((c) => [c.id.toString(), c]));

      return rows.map((row) => {
        const campaignId = (row as RowWithCampaignId).campaignId;
        const campaign =
          campaignId != null ? campaignById.get(campaignId.toString()) ?? null : null;
        return { ...row, campaign };
      });
    } catch (e) {
      if (!retriedAfterSchemaPatch && this.isDataBatchMissingColumnP2022(e)) {
        try {
          await this.ensureDataBatchesSchemaPatches();
          return await this.findAll(true);
        } catch {
          return this.findAllWhenCampaignIdColumnMissing();
        }
      }
      if (this.isDataBatchMissingColumnP2022(e)) {
        return this.findAllWhenCampaignIdColumnMissing();
      }
      throw e;
    }
  }

  async findOne(id: number) {
    const batch = await this.prisma.dataBatch.findUnique({
      where: { id: BigInt(id) },
      include: {
        creator: true,
        leads: {
          take: 10,
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Data batch with ID ${id} not found`);
    }

    return batch;
  }

  async update(id: number, updateDataBatchDto: UpdateDataBatchDto) {
    const { createdBy, purchasePrice, ...rest } = updateDataBatchDto;

    try {
      return await this.prisma.dataBatch.update({
        where: { id: BigInt(id) },
        data: {
          ...rest,
          ...(createdBy && { createdBy: BigInt(createdBy) }),
          ...(purchasePrice && { purchasePrice: Number(purchasePrice) }),
        },
      });
    } catch (error) {
      throw new NotFoundException(`Data batch with ID ${id} not found`);
    }
  }

  /**
   * Deletes a data batch and all CRM rows tied to its leads:
   * meetings, call logs, WhatsApp, feedback, assignments, auto-retractions, notifications, then leads, uploads, batch.
   * Rejects if any linked lead is not an import-originated type (cold_call, campaign, platform — all created via batch import).
   */
  async remove(id: number) {
    const batchId = BigInt(id);
    const batch = await this.prisma.dataBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException(`Data batch with ID ${id} not found`);
    }

    const leads = await this.prisma.lead.findMany({
      where: { dataBatchId: batchId },
      select: { id: true, type: true },
    });

    const importLeadTypes = new Set<LeadType>([
      LeadType.cold_call,
      LeadType.campaign,
      LeadType.platform,
    ]);
    const nonImportLeads = leads.filter((l) => !importLeadTypes.has(l.type));
    if (nonImportLeads.length > 0) {
      throw new BadRequestException(
        `This batch has ${nonImportLeads.length} lead(s) that are not import types (campaign, platform, or cold call). ` +
          `Only leads created from file/batch import can be removed with the batch.`,
      );
    }

    const leadCount = leads.length;
    let leadsDeleted = 0;

    /**
     * Few DB round-trips keyed by batch id avoid P2028 (chunked deletes were 100s of queries × large batches).
     * Keep a generous ceiling for single-statement cascades on very large installs.
     */
    const batchDeleteTxOptions = { maxWait: 30_000, timeout: 600_000 } as const;

    await this.prisma.$transaction(async (tx) => {
      if (leadCount > 0) {
        // Unit preview linkage is phone-based (client_phone), not FK-based.
        // Detach preview -> lead references for leads in this batch before deleting leads.
        await tx.$executeRaw`
          UPDATE \`unit_previews\` up
          INNER JOIN \`leads\` l ON up.\`client_phone\` = l.\`phone\`
          SET up.\`client_phone\` = NULL
          WHERE l.\`data_batch_id\` = ${batchId}
        `;

        /* Notifications are not FK-linked; match by polymorphic refs (no enormous IN (...) lists). */
        await tx.$executeRaw`
          DELETE n FROM \`notifications\` n
          WHERE (
              n.\`related_entity_type\` = 'lead'
              AND EXISTS (
                SELECT 1 FROM \`leads\` l
                WHERE l.\`id\` = n.\`related_entity_id\` AND l.\`data_batch_id\` = ${batchId}
              )
            )
            OR (
              n.\`related_entity_type\` = 'meeting'
              AND EXISTS (
                  SELECT 1
                  FROM \`meetings\` m
                  INNER JOIN \`leads\` l ON m.\`lead_id\` = l.\`id\`
                  WHERE m.\`id\` = n.\`related_entity_id\` AND l.\`data_batch_id\` = ${batchId}
              )
            )
        `;

        await tx.$executeRaw`
          DELETE al FROM \`audit_logs\` al
          INNER JOIN \`leads\` l ON al.\`entity_type\` = 'lead' AND al.\`entity_id\` = l.\`id\`
          WHERE l.\`data_batch_id\` = ${batchId}
        `;

        /* Clear optional FK before cascade deletes involving lead_feedback */
        await tx.$executeRaw`
          UPDATE \`call_logs\` c
          INNER JOIN \`leads\` l ON c.\`lead_id\` = l.\`id\`
          SET c.\`feedback_id\` = NULL
          WHERE l.\`data_batch_id\` = ${batchId}
        `;
        await tx.$executeRaw`
          UPDATE \`whatsapp_interactions\` w
          INNER JOIN \`leads\` l ON w.\`lead_id\` = l.\`id\`
          SET w.\`feedback_id\` = NULL
          WHERE l.\`data_batch_id\` = ${batchId}
        `;

        const del = await tx.lead.deleteMany({ where: { dataBatchId: batchId } });
        leadsDeleted = del.count;
      }

      await tx.leadUpload.deleteMany({ where: { dataBatchId: batchId } });
      await tx.dataBatch.delete({ where: { id: batchId } });
    }, batchDeleteTxOptions);

    return {
      deleted: true,
      batchId: id,
      leadsDeleted,
    };
  }
}
