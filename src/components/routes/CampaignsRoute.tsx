import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../redux/Store';
import Campaigns from '../../pages/Campaigns';
import { canAccessCampaignsPage } from '../../lib/userRole';

/** Campaigns UI: super_admin and operation_manager only (sidebar + Layout also enforce). */
export default function CampaignsRoute() {
    const user = useSelector((state: RootState) => state.user.user);
    if (!canAccessCampaignsPage(user)) return <Navigate to="/dashboard" replace />;
    return <Campaigns />;
}

