import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import {
    getOnboardingStepsForUser,
    SIRA_ONBOARDING_STORAGE_KEY,
    type OnboardingStep,
} from '../../lib/onboardingSteps';

export default function AppOnboardingTour() {
    const user = useSelector((state: any) => state.user.user);
    const [open, setOpen] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [steps, setSteps] = useState<OnboardingStep[]>([]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!user || !(user as { id?: unknown }).id) return;
        try {
            if (window.localStorage.getItem(SIRA_ONBOARDING_STORAGE_KEY) === '1') return;
        } catch {
            return;
        }
        const list = getOnboardingStepsForUser(user as { role?: string | { name?: string } });
        if (list.length === 0) return;
        setSteps(list);
        setStepIndex(0);
        setOpen(true);
    }, [user]);

    const finish = useCallback(() => {
        try {
            window.localStorage.setItem(SIRA_ONBOARDING_STORAGE_KEY, '1');
        } catch {
            /* ignore */
        }
        setOpen(false);
    }, []);

    const skip = finish;

    const next = useCallback(() => {
        setStepIndex((i) => {
            if (i >= steps.length - 1) {
                finish();
                return i;
            }
            return i + 1;
        });
    }, [steps.length, finish]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') skip();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, skip]);

    if (!open || steps.length === 0) return null;

    const step = steps[stepIndex];
    const isLast = stepIndex >= steps.length - 1;
    const StepIcon = step.Icon;

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    key="onboarding-root"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/70 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sira-onboarding-title"
                    aria-describedby="sira-onboarding-desc"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-sira-border bg-[var(--card)] text-card-foreground shadow-2xl"
                        style={{ backgroundColor: 'var(--card)', opacity: 1 }}
                    >
                        <button
                            type="button"
                            onClick={skip}
                            className="absolute right-3 top-3 rounded-xl p-2 text-sira-text-muted transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Skip tour"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="border-b border-sira-border bg-[var(--card)] px-6 pb-6 pt-8" style={{ backgroundColor: 'var(--card)' }}>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sira-gold text-sira-gold-foreground ring-1 ring-secondary/50">
                                <StepIcon className="h-7 w-7" strokeWidth={2.25} aria-hidden />
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sira-gold">
                                Step {stepIndex + 1} of {steps.length}
                            </p>
                            <h2 id="sira-onboarding-title" className="mt-2 text-xl font-black tracking-tight text-foreground">
                                {step.title}
                            </h2>
                        </div>

                        <div className="bg-[var(--card)] px-6 py-6" style={{ backgroundColor: 'var(--card)' }}>
                            <p id="sira-onboarding-desc" className="text-sm font-medium leading-relaxed text-sira-text-muted">
                                {step.description}
                            </p>

                            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex gap-1.5">
                                    {steps.map((_, i) => (
                                        <span
                                            key={i}
                                            className={`h-2 w-2 rounded-full transition-colors ${
                                                i === stepIndex ? 'bg-sira-gold' : 'bg-muted'
                                            }`}
                                        />
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={skip}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-sira-text-muted transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                        Skip
                                    </button>
                                    <button
                                        type="button"
                                        onClick={next}
                                        className="inline-flex items-center gap-2 rounded-xl bg-sira-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-sira-gold-foreground shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        {isLast ? 'Get started' : 'Next'}
                                        {!isLast ? <ChevronRight className="h-4 w-4" /> : null}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}

