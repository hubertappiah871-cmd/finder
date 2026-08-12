import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider } from './context/AuthContext'
import { isSupabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import { RequireAdmin, RequireAuth } from './components/Guards'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import DashboardPage from './pages/DashboardPage'
import ItemFormPage from './pages/ItemFormPage'
import SearchPage from './pages/SearchPage'
import ItemDetailPage from './pages/ItemDetailPage'
import NotificationsPage from './pages/NotificationsPage'
import MyClaimsPage from './pages/MyClaimsPage'
import AdminItemsPage from './pages/AdminItemsPage'
import AdminClaimsPage from './pages/AdminClaimsPage'
import AdminReportsPage from './pages/AdminReportsPage'
import AdminUsersPage from './pages/AdminUsersPage'
import NotFoundPage from './pages/NotFoundPage'
import SetupPage from './pages/SetupPage'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/search"
          element={
            <RequireAuth>
              <SearchPage />
            </RequireAuth>
          }
        />
        <Route
          path="/items/:id"
          element={
            <RequireAuth>
              <ItemDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/report-lost"
          element={
            <RequireAuth>
              <ItemFormPage kind="lost" />
            </RequireAuth>
          }
        />
        <Route
          path="/register-found"
          element={
            <RequireAuth>
              <ItemFormPage kind="found" />
            </RequireAuth>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireAuth>
              <NotificationsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/my-claims"
          element={
            <RequireAuth>
              <MyClaimsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/items"
          element={
            <RequireAdmin>
              <AdminItemsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/claims"
          element={
            <RequireAdmin>
              <AdminClaimsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RequireAdmin>
              <AdminReportsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  // Until real Supabase credentials are in .env, guide the user through setup.
  if (!isSupabaseConfigured) return <SetupPage />

  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
