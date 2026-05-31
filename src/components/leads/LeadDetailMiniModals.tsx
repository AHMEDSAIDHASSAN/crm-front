import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { Calendar, CalendarPlus, Loader2, Tags, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FEEDBACK_GRID_ORDER, feedbackTileClasses, resolveFeedbackGridTile } from '../../lib/leadFeedbackGrid';
import { createMeeting, createLeadFeedback, updateLead } from '../../services/api';
import { toast } from '../../lib/toast';
import { LEAD_STATUS_ENUM_VALUES } from '../../constants/leadStatus';
import { translateLeadStatus } from '../../lib/leadStatusLabel';

export const getMeetingTypes = (t: any) => [
    { value: 'site_visit', label: t('meetings.types.site_visit', { defaultValue: 'Site Visit' }) },
    { value: 'office', label: t('meetings.types.office', { defaultValue: 'Office Meeting' }) },
    { value: 'virtual', label: t('meetings.types.virtual', { defaultValue: 'Virtual Meeting' }) },
    { value: 'other', label: t('meetings.types.other', { defaultValue: 'Other' }) },
];



export const getFeedbackOutcomes = (t: any) => [
    { value: 'answered', label: translateLeadStatus(t, 'contacted') },
    { value: 'no_answer', label: translateLeadStatus(t, 'no_answer') },
    { value: 'interested', label: translateLeadStatus(t, 'interested') },
    { value: 'not_interested', label: translateLeadStatus(t, 'not_interested') },
    { value: 'scheduled_meeting', label: translateLeadStatus(t, 'another_meeting') },
    { value: 'other', label: t('meetings.other') },
];

export function ScheduleMeetingMiniModal({
    leadId,
    leadName,
    onClose,
    onSuccess,
}: {
    leadId: number;
    leadName: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { t } = useTranslation();
    const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [meetingTime, setMeetingTime] = useState('12:00');
    const [meetingType, setMeetingType] = useState('other');
    const [location, setLocation] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const types = getMeetingTypes(t);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await createMeeting({
                leadId,
                meetingDate: `${meetingDate}T${meetingTime}:00`,
                location: location.trim() || undefined,
                meetingType,
            });
            toast.success(t('leadDetail.meetingScheduledToast'));
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('leadDetail.modals.failedSchedule'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={t('leadDetail.modals.scheduleTitle', { name: leadName })}
            subtitle={t('leadDetail.modals.scheduleSubtitle', { defaultValue: 'SCHEDULE NEW APPOINTMENT' })}
            headerIcon={
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
                    <CalendarPlus className="h-6 w-6" aria-hidden />
                </div>
            }
        >
            <p className="mb-5 text-sm font-medium text-slate-600 dark:text-slate-400">{t('leadDetail.modals.scheduleDesc')}</p>
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="modal-label">{t('leadDetail.modals.date')}</label>
                        <input
                            type="date"
                            value={meetingDate}
                            onChange={(e) => setMeetingDate(e.target.value)}
                            className="modal-input"
                            required
                        />
                    </div>
                    <div>
                        <label className="modal-label">{t('leadDetail.modals.time')}</label>
                        <input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className="modal-input" />
                    </div>
                </div>

                <div>
                    <label className="modal-label">{t('leadDetail.modals.type')}</label>
                    <div className="flex flex-wrap gap-2">
                        {types.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setMeetingType(opt.value)}
                                className={cn(
                                    'modal-pill flex-1 min-w-[6.5rem] sm:flex-none',
                                    meetingType === opt.value ? 'modal-pill-active' : 'modal-pill-idle',
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="modal-label">{t('leadDetail.modals.locationOptional')}</label>
                    <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={t('leadDetail.modals.addressVenue')}
                        className="modal-input"
                    />
                </div>

                <div className="modal-actions-stack">
                    <button type="submit" disabled={submitting} className="modal-btn-primary">
                        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Calendar className="h-5 w-5" />}
                        {t('leadDetail.modals.scheduleBtn')}
                    </button>
                    <button type="button" onClick={onClose} className="modal-cancel-link">
                        {t('leadDetail.modals.cancel')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export function AddFeedbackModal({
    leadId,
    userId,
    currentStatus,
    onClose,
    onSuccess,
}: {
    leadId: number;
    userId: number;
    currentStatus: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { t } = useTranslation();
    const [status, setStatus] = useState(currentStatus || 'new_lead');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const feedbackStatusOptions = FEEDBACK_GRID_ORDER;

    useEffect(() => {
        setStatus(currentStatus || 'new_lead');
        setDescription('');
    }, [leadId, currentStatus]);

    const handleSubmit = async () => {
        if (!description.trim()) {
            toast.error(t('leadDetail.modals.descRequired', { defaultValue: 'Please enter a description' }));
            return;
        }

        setSubmitting(true);
        try {
            await Promise.all([
                updateLead(leadId, { status }),
                createLeadFeedback({
                    leadId,
                    userId,
                    feedbackType: status,
                    description: description.trim(),
                }),
            ]);
            toast.success(t('leadDetail.feedbackAdded', { defaultValue: 'Feedback added successfully' }));
            onSuccess();
        } catch (err: any) {
            toast.error(
                err.response?.data?.message ||
                    t('leadDetail.modals.failedFeedback', { defaultValue: 'Failed to add feedback' }),
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="3xl"
            title={t('leadDetail.updateFeedback', { defaultValue: 'Update feedback' })}
            subtitle={t('leadDetail.modals.addFeedbackSubtitle', { defaultValue: 'ADD FEEDBACK' })}
            headerIcon={
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
                    <Zap className="h-6 w-6" aria-hidden />
                </div>
            }
        >
            <div className="space-y-5">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#0B1828]">
                        <Zap className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[15px] font-bold text-slate-500">
                            {t('leadDetail.selectLeadStage', { defaultValue: 'Select lead stage' })}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    {feedbackStatusOptions.map((value) => {
                        const tile = resolveFeedbackGridTile(value);
                        const tileLabel = translateLeadStatus(t, value);
                        const selected = status === value;
                        const cls = feedbackTileClasses(value);
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setStatus(value)}
                                className={cn(
                                    'relative flex min-h-[90px] flex-col items-center justify-center gap-2 rounded-2xl border-2 p-2.5 text-center transition-all duration-200 active:scale-[0.97] sm:min-h-[100px] sm:p-3',
                                    selected ? cls.active + ' shadow-lg scale-[1.02]' : cls.idle + ' hover:shadow-md hover:scale-[1.01]',
                                )}
                            >
                                {selected && (
                                    <span className="absolute top-1.5 end-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/30">
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </span>
                                )}
                                <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl transition-colors', selected ? cls.iconActive : cls.iconIdle)}>
                                    {tile.icon}
                                </div>
                                <span className="text-[11px] font-black leading-tight text-center sm:text-[12px]">
                                    {tileLabel}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div>
                    <label className="modal-label">
                        {t('leadDetail.modals.description', { defaultValue: 'Notes' })}
                        <span className="ms-1 text-rose-500">*</span>
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t('leadDetail.feedbackNotesPlaceholder', {
                            defaultValue: 'Write your notes here about this lead and next steps...',
                        })}
                        rows={4}
                        required
                        className="min-h-[100px] w-full resize-none rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-[13px] font-bold text-[#0B1828] outline-none transition-all placeholder:text-slate-400 focus:border-[#0B1828]/20 focus:bg-white"
                    />
                </div>

                <div className="modal-actions-stack">
                    <button type="button" disabled={submitting} onClick={() => void handleSubmit()} className="modal-btn-primary">
                        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                        {t('leadDetail.modals.addFeedbackBtn')}
                    </button>
                    <button type="button" onClick={onClose} className="modal-cancel-link">
                        {t('leadDetail.modals.cancel')}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export function ChangeStatusModal({
    leadId,
    currentStatus,
    onClose,
    onSuccess,
}: {
    leadId: number;
    currentStatus: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { t } = useTranslation();
    const [status, setStatus] = useState(currentStatus || 'new_lead');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await updateLead(leadId, { status });
            toast.success(t('leadDetail.statusUpdated', { defaultValue: 'Status updated successfully' }));
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('leadDetail.errorUpdatingStatus', { defaultValue: 'Failed to update' }));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={t('leadDetail.modals.changeStatusTitle', { defaultValue: 'تغيير الحالة' })}
            subtitle={t('leadDetail.modals.changeStatusSubtitle', { defaultValue: 'UPDATE STATUS' })}
            headerIcon={
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
                    <Tags className="h-6 w-6" aria-hidden />
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="modal-label">{t('leadDetail.status')}</label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="modal-input h-12 border-slate-200 py-0 text-start font-semibold dark:border-slate-600">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {LEAD_STATUS_ENUM_VALUES.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {translateLeadStatus(t, value)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="modal-actions-stack">
                    <button type="submit" disabled={submitting || status === currentStatus} className="modal-btn-primary">
                        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                        {t('leadDetail.modals.saveBtn', { defaultValue: 'Save' })}
                    </button>
                    <button type="button" onClick={onClose} className="modal-cancel-link">
                        {t('leadDetail.modals.cancel')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

