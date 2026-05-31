import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme } from '../../lib/theme';

export default function ThemeToggle({ className = '' }: { className?: string }) {
    const [mode, setMode] = useState<'light' | 'dark'>(() => getStoredTheme());

    useEffect(() => {
        applyTheme(mode);
    }, [mode]);

    const toggle = () => setMode((m) => (m === 'light' ? 'dark' : 'light'));

    return (
        <button
            type="button"
            onClick={toggle}
            className={`inline-flex items-center justify-center rounded-full border border-sira-border bg-muted p-2.5 text-foreground transition-colors hover:bg-foreground/10 hover:border-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
            aria-label={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={mode === 'light' ? 'Dark mode' : 'Light mode'}
        >
            {mode === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5 text-sira-gold" />}
        </button>
    );
}

