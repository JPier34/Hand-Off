import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import CreateDeal from "./pages/CreateDeal";
import FundDeal from "./pages/FundDeal";
import UnlockDeal from "./pages/UnlockDeal";
import Profile from "./pages/Profile";
import WalletButton from "./components/WalletButton";

export default function App() {
  return (
    <BrowserRouter>
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-surface/80 backdrop-blur-md border-b border-surface-border">
        <NavLink to="/" className="flex items-center gap-2">
          <img src="/logo.svg" alt="HandOff" className="w-7 h-7" />
          <span className="text-base font-bold text-white">
            Hand<span className="text-brand-500">Off</span>
          </span>
        </NavLink>
        <WalletButton />
      </header>

      <main className="min-h-screen bg-surface">
        <Routes>
          <Route path="/" element={<CreateDeal />} />
          <Route path="/fund/:contractAddress" element={<FundDeal />} />
          <Route path="/unlock/:contractAddress" element={<UnlockDeal />} />
          <Route path="/profile/:address" element={<Profile />} />
          <Route
            path="*"
            element={
              <div className="flex flex-col items-center justify-center h-96 gap-4 text-slate-400">
                <span className="text-5xl">🤝</span>
                <p className="text-xl font-bold text-white">Page not found</p>
                <NavLink to="/" className="text-brand-400 underline">Back to home</NavLink>
              </div>
            }
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
