import { Navigate, createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { BasicLayout } from '../layouts/BasicLayout';
import { LoginPage } from '../pages/login/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { CategoriesPage } from '../pages/categories/CategoriesPage';
import { SharedSpecGroupsPage } from '../pages/spec-groups/SharedSpecGroupsPage';
import { SharedSpecGroupEditPage } from '../pages/spec-groups/SharedSpecGroupEditPage';
import { GoodsListPage } from '../pages/goods/GoodsListPage';
import { GoodEditPage } from '../pages/goods/GoodEditPage';
import { OrdersListPage } from '../pages/orders/OrdersListPage';
import { OrderDetailPage } from '../pages/orders/OrderDetailPage';
import { TablesPage } from '../pages/tables/TablesPage';
import { TableDetailPage } from '../pages/tables/TableDetailPage';
import { StorePage } from '../pages/stores/StorePage';
import { NotFoundPage } from '../pages/system/NotFoundPage';
import { ProfilePage } from '../pages/profile/ProfilePage';
import { AutoEntryRedirect } from '../pages/system/AutoEntryRedirect';
import { PlatformOverviewPage } from '../pages/platform/PlatformOverviewPage';
import { PlatformTenantsPage } from '../pages/platform/PlatformTenantsPage';
import { PlatformStoresPage } from '../pages/platform/PlatformStoresPage';
import { PlatformUsersPage } from '../pages/platform/PlatformUsersPage';
import { PlatformBrandingPage } from '../pages/platform/PlatformBrandingPage';
import { TenantOverviewPage } from '../pages/tenant/TenantOverviewPage';
import { TenantStoresPage } from '../pages/tenant/TenantStoresPage';
import { TenantBrandingPage } from '../pages/tenant/TenantBrandingPage';
import { TenantUsersPage } from '../pages/tenant/TenantUsersPage';
import { StoreUsersPage } from '../pages/store/StoreUsersPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <AutoEntryRedirect /> },
      {
        element: <BasicLayout />,
        children: [
          { path: '/platform/overview', element: <PlatformOverviewPage /> },
          { path: '/platform/tenants', element: <PlatformTenantsPage /> },
          { path: '/platform/stores', element: <PlatformStoresPage /> },
          { path: '/platform/users', element: <PlatformUsersPage /> },
          { path: '/platform/branding', element: <PlatformBrandingPage /> },

          { path: '/tenant/overview', element: <TenantOverviewPage /> },
          { path: '/tenant/stores', element: <TenantStoresPage /> },
          { path: '/tenant/users', element: <TenantUsersPage /> },
          { path: '/tenant/brand', element: <TenantBrandingPage /> },
          { path: '/tenant/shared-data/categories', element: <CategoriesPage /> },
          { path: '/tenant/shared-data/spec-groups', element: <SharedSpecGroupsPage /> },
          { path: '/tenant/shared-data/spec-groups/new', element: <SharedSpecGroupEditPage mode="create" /> },
          {
            path: '/tenant/shared-data/spec-groups/:sharedSpecGroupId',
            element: <SharedSpecGroupEditPage mode="edit" />,
          },
          { path: '/tenant/shared-data/goods', element: <GoodsListPage /> },
          { path: '/tenant/shared-data/goods/new', element: <GoodEditPage mode="create" /> },
          { path: '/tenant/shared-data/goods/:goodId', element: <GoodEditPage mode="edit" /> },

          { path: '/store/overview', element: <DashboardPage /> },
          { path: '/store/categories', element: <CategoriesPage /> },
          { path: '/store/spec-groups', element: <SharedSpecGroupsPage /> },
          { path: '/store/spec-groups/new', element: <SharedSpecGroupEditPage mode="create" /> },
          { path: '/store/spec-groups/:sharedSpecGroupId', element: <SharedSpecGroupEditPage mode="edit" /> },
          { path: '/store/goods', element: <GoodsListPage /> },
          { path: '/store/goods/new', element: <GoodEditPage mode="create" /> },
          { path: '/store/goods/:goodId', element: <GoodEditPage mode="edit" /> },
          { path: '/store/orders', element: <OrdersListPage /> },
          { path: '/store/orders/:orderId', element: <OrderDetailPage /> },
          { path: '/store/tables', element: <TablesPage /> },
          { path: '/store/tables/:tableId', element: <TableDetailPage /> },
          { path: '/store/users', element: <StoreUsersPage /> },
          { path: '/store/store', element: <StorePage /> },

          { path: '/dashboard', element: <Navigate to="/store/overview" replace /> },
          { path: '/categories', element: <CategoriesPage /> },
          { path: '/spec-groups', element: <SharedSpecGroupsPage /> },
          { path: '/spec-groups/new', element: <SharedSpecGroupEditPage mode="create" /> },
          { path: '/spec-groups/:sharedSpecGroupId', element: <SharedSpecGroupEditPage mode="edit" /> },
          { path: '/goods', element: <GoodsListPage /> },
          { path: '/goods/new', element: <GoodEditPage mode="create" /> },
          { path: '/goods/:goodId', element: <GoodEditPage mode="edit" /> },
          { path: '/orders', element: <OrdersListPage /> },
          { path: '/orders/:orderId', element: <OrderDetailPage /> },
          { path: '/tables', element: <TablesPage /> },
          { path: '/tables/:tableId', element: <TableDetailPage /> },
          { path: '/stores', element: <StorePage /> },

          { path: '/profile', element: <ProfilePage /> },
          { path: '/users', element: <Navigate to="/platform/users" replace /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
