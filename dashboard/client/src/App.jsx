import { Routes, Route } from 'react-router-dom'
import { GuildProvider } from './context/GuildContext.jsx'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import General from './pages/General.jsx'
import Logging from './pages/Logging.jsx'
import Leveling from './pages/Leveling.jsx'
import Tickets from './pages/Tickets.jsx'
import Verification from './pages/Verification.jsx'
import Welcome from './pages/Welcome.jsx'
import Moderation from './pages/Moderation.jsx'
import Commands from './pages/Commands.jsx'
import Applications from './pages/Applications.jsx'
import JoinToCreate from './pages/JoinToCreate.jsx'
import RaidShield from './pages/RaidShield.jsx'
import Economy from './pages/Economy.jsx'

export default function App() {
  return (
    <GuildProvider>
      <div className="flex min-h-screen bg-[#0f1117] text-white">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 overflow-y-auto p-8">
            <Routes>
              <Route path="/"               element={<General />} />
              <Route path="/logging"        element={<Logging />} />
              <Route path="/leveling"       element={<Leveling />} />
              <Route path="/tickets"        element={<Tickets />} />
              <Route path="/verification"   element={<Verification />} />
              <Route path="/welcome"        element={<Welcome />} />
              <Route path="/moderation"     element={<Moderation />} />
              <Route path="/commands"       element={<Commands />} />
              <Route path="/applications"   element={<Applications />} />
              <Route path="/join-to-create" element={<JoinToCreate />} />
              <Route path="/raid-shield"    element={<RaidShield />} />
              <Route path="/economy"        element={<Economy />} />
            </Routes>
          </main>
        </div>
      </div>
    </GuildProvider>
  )
}
