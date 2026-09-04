import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import RamosView from './views/RamosView'
import RamoView from './views/RamoView'
import AgregarRamoView from './views/AgregarRamoView'
import FichaDetailView from './views/FichaDetailView'
import BuscarView from './views/BuscarView'
import RepasoView from './views/RepasoView'
import AjustesView from './views/AjustesView'

function Shell() {
  const { pathname } = useLocation()
  const ocultarNav =
    pathname.startsWith('/ficha/') ||
    pathname.startsWith('/ramo/nuevo') ||
    /^\/ramo\/[^/]+\/editar$/.test(pathname)

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<RamosView />} />
          <Route path="/ramo/nuevo" element={<AgregarRamoView />} />
          <Route path="/ramo/:id" element={<RamoView />} />
          <Route path="/ramo/:id/editar" element={<AgregarRamoView />} />
          <Route path="/ficha/:id" element={<FichaDetailView />} />
          <Route path="/buscar" element={<BuscarView />} />
          <Route path="/repaso" element={<RepasoView />} />
          <Route path="/ajustes" element={<AjustesView />} />
        </Routes>
      </main>
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
