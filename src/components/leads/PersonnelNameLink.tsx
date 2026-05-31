import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { cn } from '../../lib/utils';

export function formatUser(u: { firstName?: string; lastName?: string } | null | undefined) {
    if (!u) return '—';
    const s = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return s || '—';
}

export function PersonnelNameLink({
    user,
    className,
    profileTitle,
}: {
    user: any;
    className?: string;
    profileTitle?: string;
}) {
    const currentUser = useSelector((state: any) => state.user.user);
    const viewerRoleRaw =
        typeof currentUser?.role === 'string'
            ? currentUser.role
            : currentUser?.role?.name;
    const viewerRole = String(viewerRoleRaw || '').toLowerCase();
    const targetRoleRaw =
        typeof user?.role === 'string'
            ? user.role
            : user?.role?.name;
    const targetRole = String(targetRoleRaw || '').toLowerCase();
    const blockProfileLink = viewerRole === 'operation_manager' && targetRole === 'super_admin';
    if (!user) return <span className={className}>—</span>;
    const name = formatUser(user);
    const rawId = user.id;
    if (rawId === undefined || rawId === null || blockProfileLink) return <span className={className}>{name}</span>;
    const idStr = String(rawId);
    return (
        <Link
            to={`/personnel/${idStr}`}
            title={profileTitle}
            className={cn('font-semibold text-sira-brown underline-offset-2 hover:underline', className)}
        >
            {name}
        </Link>
    );
}
