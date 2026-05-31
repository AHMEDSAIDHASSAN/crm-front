import {
    Facebook,
    Instagram,
    Globe,
    Layers2,
    Building2,
    Tag,
    type LucideIcon,
} from 'lucide-react';
import { cn } from './utils';

export type CampaignPlatformKey =
    | 'facebook'
    | 'instagram'
    | 'meta'
    | 'property_finder'
    | 'dubizzle'
    | 'other'
    | string;

export const CAMPAIGN_PLATFORM_OPTIONS: {
    value: CampaignPlatformKey;
    label: string;
    Icon: LucideIcon;
    iconClass: string;
}[] = [
    { value: 'facebook', label: 'Facebook', Icon: Facebook, iconClass: 'text-[#1877F2]' },
    { value: 'instagram', label: 'Instagram', Icon: Instagram, iconClass: 'text-pink-500' },
    { value: 'meta', label: 'Meta (General)', Icon: Layers2, iconClass: 'text-sky-600' },
    { value: 'property_finder', label: 'Property Finder', Icon: Building2, iconClass: 'text-amber-600' },
    { value: 'dubizzle', label: 'Dubizzle', Icon: Tag, iconClass: 'text-red-600' },
    { value: 'other', label: 'Other', Icon: Globe, iconClass: 'text-sira-text-muted' },
];

function iconForPlatform(platform?: string | null): {
    Icon: LucideIcon;
    className: string;
} | null {
    const p = platform ?? '';
    const found = CAMPAIGN_PLATFORM_OPTIONS.find((o) => o.value === p);
    if (found) return { Icon: found.Icon, className: cn('shrink-0', found.iconClass) };
    return null;
}

export type CampaignIconSource = {
    platform?: string | null;
    platformIcon?: string | null;
    platformLabel?: string | null;
};

/**
 * Renders the platform mark for a campaign row or filter: custom URL/emoji, then known platform, then globe.
 */
export function CampaignPlatformIcon({
    campaign,
    platform,
    platformIcon,
    className = 'h-5 w-5',
}: {
    campaign?: CampaignIconSource | null;
    platform?: string | null;
    platformIcon?: string | null;
    className?: string;
}) {
    const p = platform ?? campaign?.platform;
    const icon = platformIcon ?? campaign?.platformIcon;
    const sizeClass = className;

    if (icon) {
        const s = String(icon).trim();
        if (s) {
            if (/^https?:\/\//i.test(s)) {
                return (
                    <img src={s} alt="" className={cn(sizeClass, 'rounded object-cover')} />
                );
            }
            return (
                <span className={cn(sizeClass, 'flex items-center justify-center text-lg leading-none')}>{s}</span>
            );
        }
    }

    const mapped = iconForPlatform(p);
    if (mapped) {
        const { Icon, className: iconCls } = mapped;
        return <Icon className={cn(sizeClass, iconCls)} strokeWidth={2} aria-hidden />;
    }

    return <Globe className={cn(sizeClass, 'text-sira-text-muted')} strokeWidth={2} aria-hidden />;
}

