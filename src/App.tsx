import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import LeadDetailPage from './pages/LeadDetailPage'
import Units from './pages/Units'
import UnitDetailPage from './pages/UnitDetailPage'
import PreviewDetailPage from './pages/PreviewDetailPage'
import CampaignsRoute from './components/routes/CampaignsRoute'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Personnel from './pages/Personnel'
import BrokerageHubLayout from './components/layout/BrokerageHubLayout'
import SalesPersonProfile from './pages/SalesPersonProfile'
import HrProfile from './pages/HrProfile'
import Profile from './pages/Profile'
import Meetings from './pages/Meetings'
import Hrs from './pages/Hrs'
import Finance from './pages/Finance'
import FinanceEmployeeDetail from './pages/FinanceEmployeeDetail'
import CalculatorPage from './pages/Calculator'
import Performance from './pages/Performance'
import SavedItems from './pages/SavedItems'
import Layout from './components/layout/Layout'
import WhatsAppGateway from './pages/WhatsAppGateway'
import WhatsAppWebConnect from './pages/WhatsAppWebConnect'
import WhatsAppBroadcastPage from './pages/WhatsAppBroadcastPage'
import SalesAssistant from './pages/SalesAssistant'
import Attendance from './pages/Attendance'
import { Toaster } from 'sonner'

function App() {

  const router = createBrowserRouter([
    {
      path: "/login",
      element: <Login />,
    },
    {
      path: "/",
      element: <Layout />,
      children: [
        {
          index: true,
          element: <Navigate to="/dashboard" replace />,
        },
        {
          path: "dashboard",
          element: <Dashboard />,
        },
        {
          path: "leads",
          element: <Leads />,
        },
        {
          path: "leads/:leadId",
          element: <LeadDetailPage />,
        },
        {
          path: "units",
          element: <Units />,
        },
        {
          path: "units/previews/:previewId",
          element: <PreviewDetailPage />,
        },
        {
          path: "units/:unitId",
          element: <UnitDetailPage />,
        },
        {
          path: "calculator",
          element: <CalculatorPage />,
        },
        {
          path: "teams/:teamId",
          element: <TeamDetail />,
        },
        {
          path: "teams",
          element: <Navigate to="/brokerage/teams" replace />,
        },
        {
          path: "brokerage",
          element: <BrokerageHubLayout />,
          children: [
            { index: true, element: <Navigate to="teams" replace /> },
            { path: "agents", element: <Personnel /> },
            { path: "teams", element: <Teams /> },
          ],
        },
        {
          path: "personnel/:userId/hr",
          element: <HrProfile />,
        },
        {
          path: "personnel/:userId",
          element: <SalesPersonProfile />,
        },
        {
          path: "personnel",
          element: <Navigate to="/brokerage/agents" replace />,
        },
        {
          path: "meetings",
          element: <Meetings />,
        },
        {
          path: "attendance",
          element: <Attendance />,
        },
        {
          path: "performance",
          element: <Performance />,
        },
        {
          path: "hrs",
          element: <Hrs />,
        },
        {
          path: "campaigns",
          element: <CampaignsRoute />,
        },
        {
          path: "finance/:userId",
          element: <FinanceEmployeeDetail />,
        },
        {
          path: "finance",
          element: <Finance />,
        },
        {
          path: "settings",
          element: <Dashboard />,
        },
        {
          path: "settings/whatsapp",
          element: <WhatsAppGateway />,
        },
        {
          path: "whatsapp-broadcast",
          element: <WhatsAppBroadcastPage />,
        },
        {
          path: "settings/whatsapp-connect",
          element: <WhatsAppWebConnect />,
        },
        {
          path: "sales-assistant",
          element: <SalesAssistant />,
        },
        {
          path: "profile",
          element: <Profile />,
        },
        {
          path: "saved",
          element: <SavedItems />,
        },
      ]
    },
    {
      path: "*",
      element: <Navigate to="/login" replace />,
    },
  ]);
  return (
    <>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        dir="rtl"
        richColors
        closeButton
        duration={4000}
        gap={10}
        toastOptions={{
          style: {
            fontFamily: 'inherit',
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: '700',
            boxShadow: '0 8px 32px rgba(11,24,40,0.18)',
            border: '1px solid rgba(11,24,40,0.08)',
            padding: '14px 16px',
          },
          classNames: {
            toast: 'sira-toast',
            success: 'sira-toast-success',
            error: 'sira-toast-error',
            info: 'sira-toast-info',
            warning: 'sira-toast-warning',
          },
        }}
      />
    </>
  );
}

export default App

