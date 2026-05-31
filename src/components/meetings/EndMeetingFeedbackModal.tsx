import { useState } from 'react';
import { Loader2, Flag } from 'lucide-react';
import Modal from '../ui/Modal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { updateMeeting, createLeadFeedback, updateLead } from '../../services/api';
import { toast } from '../../lib/toast';
import { coordsToMeetingString, getMeetingGpsPosition } from '../../utils/meetingGeolocation';
import { useTranslation } from 'react-i18next';

import { FEEDBACK_GRID_ORDER } from '../../lib/leadFeedbackGrid';
import { translateLeadStatus } from '../../lib/leadStatusLabel';

export default function EndMeetingFeedbackModal({
    meeting,
    currentUser,
    onClose,
    onSuccess,
}: {
    meeting: any;
    currentUser: any;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { t } = useTranslation();
    const roleName =
        typeof currentUser?.role === 'string'
            ? String(currentUser.role).toLowerCase()
            : String(currentUser?.role?.name || '').toLowerCase();
    const statusOptions = roleName === 'sales'
        ? FEEDBACK_GRID_ORDER.filter((s) => (s as any) !== 'rotation')
        : FEEDBACK_GRID_ORDER;
    const allowedFeedbackTypes = new Set(statusOptions);
    const currentLeadStatus = meeting?.lead?.status;
    const initialFeedbackType = allowedFeedbackTypes.has(currentLeadStatus)
        ? currentLeadStatus
        : 'follow_up';
    const [feedbackType, setFeedbackType] = useState(initialFeedbackType);

    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const userId = currentUser?.id != null ? Number(currentUser.id) : 0;
        const leadId = meeting?.lead?.id != null ? Number(meeting.lead.id) : 0;
        if (!leadId || !userId) {
            toast.error('Missing lead or user');
            return;
        }
        if (!description.trim()) {
            toast.error(t('leadDetail.modals.descRequired', { defaultValue: 'Please enter a description' }));
            return;
        }
        setSubmitting(true);
        try {
            const safeFeedbackType = allowedFeedbackTypes.has(feedbackType)
                ? feedbackType
                : 'follow_up';
            let checkoutLocation: string | undefined;
            try {
                const pos = await getMeetingGpsPosition();
                checkoutLocation = coordsToMeetingString(pos.coords.latitude, pos.coords.longitude);
            } catch {
                /* check-out GPS optional — meeting still completes */
            }
            // One timestamp for “meeting ended” (saved with check-out GPS when available)
            const endedAt = new Date().toISOString();

            await Promise.all([
                updateMeeting(Number(meeting.id), {
                    status: 'completed',
                    endedAt,
                    feedback: description.trim(),
                    ...(checkoutLocation ? { checkoutLocation } : {}),
                }),
                createLeadFeedback({
                    leadId,
                    userId,
                    feedbackType: safeFeedbackType,
                    description: description.trim(),
                }),
                updateLead(leadId, { status: safeFeedbackType }),
            ]);
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to end meeting');
        } finally {
            setSubmitting(false);
        }
    };

    const name = [meeting?.lead?.firstName, meeting?.lead?.lastName].filter(Boolean).join(' ') || t('leadDetail.leadSystemFallback', { defaultValue: 'Lead' });
    return (
        <Modal
            isOpen
            onClose={onClose}
            title={`${t('leadDetail.modals.endMeetingTitle', { defaultValue: 'End meeting' })} — ${name}`}
            subtitle={t('leadDetail.modals.endMeetingSubtitle', { defaultValue: 'MEETING FEEDBACK' })}
            headerIcon={
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
                    <Flag className="h-6 w-6" aria-hidden />
                </div>
            }
        >
            <p className="mb-5 text-sm font-medium text-slate-600 dark:text-slate-400">
                {t('leadDetail.modals.endMeetingDisclaimer', { defaultValue: 'Add feedback and update the lead status. Location will be tracked upon submitting.' })}
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="modal-label">
                        {t('leadDetail.modals.status', { defaultValue: 'Status' })}
                    </label>
                    <Select value={feedbackType} onValueChange={setFeedbackType}>
                        <SelectTrigger className="modal-input h-12 border-slate-200 !bg-white py-0 text-start font-semibold !text-[#0B1828] hover:!bg-white focus:!bg-white data-[state=open]:!bg-white [&_span]:!text-[#0B1828] [&_[data-placeholder]]:!text-[#0B1828] [&_svg]:text-[#0B1828] dark:border-slate-600 dark:!text-slate-100 dark:[&_span]:!text-slate-100">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-sira-border shadow-2xl [&_[data-slot='select-item'][data-highlighted]]:bg-[#0B1828] [&_[data-slot='select-item'][data-highlighted]]:text-white">
                            {statusOptions.map((statusValue) => (
                                <SelectItem
                                    key={statusValue}
                                    value={statusValue}
                                    className="text-[12px] font-black text-[#0B1828]"
                                >
                                    {translateLeadStatus(t, statusValue)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <label className="modal-label">{t('leadDetail.modals.description')}</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t('leadDetail.modals.feedbackPlaceholder')}
                        rows={4}
                        className="modal-textarea"
                    />
                </div>
                <div className="modal-actions-stack">
                    <button type="submit" disabled={submitting} className="modal-btn-primary">
                        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                        {t('leadDetail.modals.endMeetingBtn', { defaultValue: 'End meeting & save feedback' })}
                    </button>
                    <button type="button" onClick={onClose} className="modal-cancel-link">
                        {t('leadDetail.modals.cancel')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

