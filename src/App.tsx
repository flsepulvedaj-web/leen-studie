import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import JobsIndicador from './components/JobsIndicador'
import ActualizacionBanner from './components/ActualizacionBanner'
import RamosView from './views/RamosView'
import RamoView from './views/RamoView'
import AgregarRamoView from './views/AgregarRamoView'
import FichaDetailView from './views/FichaDetailView'
import BuscarView from './views/BuscarView'
import RepasoView from './views/RepasoView'
import AjustesView from './views/AjustesView'
import TranscribirView from './views/TranscribirView'
import TranscripcionView from './views/TranscripcionView'

function Shell() {
  const { pathname } = useLocation()
  const ocultarNav =
    pathname.startsWith('/ficha/') ||
    pathname.startsWith('/transcripcion/') ||
    pathname.startsWith('/ramo/nuevo') ||
    /^\/ramo\/[^/]+\/editar$/.test(pathname)
  // En estas pantallas el avance ya se ve en la propia pantalla.
  const ocultarCinta =
    pathname.startsWith('/transcribir') || pathname.startsWith('/transcripcion/')

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col lg:max-w-3xl">
      <ActualizacionBanner />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<RamosView />} />
          <Route path="/ramo/nuevo" element={<AgregarRamoView />} />
          <Route path="/ramo/:id" element={<RamoView />} />
          <Route path="/ramo/:id/editar" element={<AgregarRamoView />} />
          <Route path="/ficha/:id" element={<FichaDetailView />} />
          <Route path="/buscar" element={<BuscarView />} />
          <Route path="/repaso" element={<RepasoView />} />
          <Route path="/transcribir" element={<TranscribirView />} />
          <Route path="/transcripcion/:id" element={<TranscripcionView />} />
          <Route path="/ajustes" element={<AjustesView />} />
        </Routes>
      </main>
      {!ocultarCinta && (
        <JobsIndicador conNav={!ocultarNav} sobreBoton={pathname === '/'} />
      )}
      {!ocultarNav && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
