import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppDataProvider } from './context/AppData'
import { RequireStaff } from './components/RequireStaff'
import { RequireCustomer } from './components/RequireCustomer'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Report } from './pages/Report'
import { Submit } from './pages/Submit'
import { Tracking } from './pages/Tracking'
import { MyTickets } from './pages/MyTickets'

function App() {
  return (
    <BrowserRouter>
      <AppDataProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/my-tickets"
            element={
              <RequireCustomer>
                <MyTickets />
              </RequireCustomer>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireStaff>
                <Dashboard />
              </RequireStaff>
            }
          />
          <Route
            path="/report"
            element={
              <RequireStaff>
                <Report />
              </RequireStaff>
            }
          />
          <Route path="/:tenantSlug/submit" element={<Submit />} />
          <Route path="/:tenantSlug/track" element={<Tracking />} />
          <Route path="/:tenantSlug/track/:ticketId" element={<Tracking />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AppDataProvider>
    </BrowserRouter>
  )
}

export default App
