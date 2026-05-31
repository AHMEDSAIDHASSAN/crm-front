import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import SiraDashboardShell from './SiraDashboardShell';
import Header from './Header';
import AppOnboardingTour from '../onboarding/AppOnboardingTour';
import AIChatWidget from '../ai/AIChatWidget';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getProfile, isJwtExpired } from '../../services/api';
import { login, logout } from '../../redux/UserSlice';
import { getUserRoleName, canAccessCampaignsPage } from '../../lib/userRole';
import { useTranslation } from 'react-i18next';
export default function Layout() {
    const { i18n } = useTranslation();
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useSelector((state: any) => state.user.user);
    const roleName = getUserRoleName(user);
    const isSales = roleName === 'sales';
    const isMarketing = roleName === 'marketing';
    const isHr = roleName === 'hr';

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || isJwtExpired(token)) {
            dispatch(logout());
            navigate('/login?reset=true', { replace: true });
            return;
        }

        const syncProfile = async () => {
            try {
                const userData = await getProfile();
                dispatch(login({ user: userData, token }));
            } catch (error: any) {
                console.error('Failed to sync profile:', error);
                if (error.response?.status === 401) {
                    dispatch(logout());
                    navigate('/login?reset=true', { replace: true });
                }
            }
        };

        syncProfile();
    }, [dispatch, navigate]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            const token = localStorage.getItem('token');
            if (token && isJwtExpired(token)) {
                dispatch(logout());
                navigate('/login?reset=true', { replace: true });
            }
        }, 30000);

        return () => window.clearInterval(interval);
    }, [dispatch, navigate]);

    useEffect(() => {
        if (!isSales || !user) return;
        const path = location.pathname;
        if (path.startsWith('/teams')) {
            navigate('/dashboard', { replace: true });
            return;
        }
        if (path.startsWith('/brokerage')) {
            navigate('/dashboard', { replace: true });
            return;
        }
        if (path === '/personnel') {
            navigate('/dashboard', { replace: true });
            return;
        }
        const personnelProfile = path.match(/^\/personnel\/(\d+)$/);
        if (personnelProfile) {
            const pid = personnelProfile[1];
            if (pid !== String(user?.id)) {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [isSales, user, location.pathname, navigate]);

    useEffect(() => {
        if (!user) return;
        if (!location.pathname.startsWith('/campaigns')) return;
        if (!canAccessCampaignsPage(user)) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, location.pathname, navigate]);

    useEffect(() => {
        if (!isMarketing || !user) return;
        const path = location.pathname;
        const allowed =
            path === '/units' ||
            path === '/profile' ||
            /^\/units\/[^/]+$/.test(path);
        if (!allowed) {
            navigate({ pathname: '/units', search: '?tab=requests' }, { replace: true });
        }
    }, [isMarketing, user, location.pathname, navigate]);

    useEffect(() => {
        if (!isHr || !user) return;
        const path = location.pathname;
        const allowed =
            path === '/hrs' ||
            path === '/finance' ||
            path.startsWith('/finance/') ||
            path === '/dashboard' ||
            path === '/profile';
        if (!allowed) {
            navigate('/hrs', { replace: true });
        }
    }, [isHr, user, location.pathname, navigate]);

    useEffect(() => {
        if (!user) return;
        if (location.pathname !== '/hrs') return;
        if (roleName !== 'super_admin' && roleName !== 'hr') {
            navigate('/dashboard', { replace: true });
        }
    }, [user, roleName, location.pathname, navigate]);

    useEffect(() => {
        setMobileSidebarOpen(false);
    }, [location.pathname]);

    return (
        <div key={i18n.language} className="flex h-dvh min-h-0 overflow-hidden overflow-x-hidden bg-slate-50">
            <AppOnboardingTour />
            <AIChatWidget />
            <SiraDashboardShell
                mobileSidebarOpen={mobileSidebarOpen}
                onCloseMobile={() => setMobileSidebarOpen(false)}
            >
                <Header
                    mobileSidebarOpen={mobileSidebarOpen}
                    onToggleMobile={() => setMobileSidebarOpen((prev) => !prev)}
                />
                <main className="custom-scrollbar relative z-0 min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6 lg:pr-0">
                    <Outlet />
                </main>
            </SiraDashboardShell>
        </div>
    );
}

