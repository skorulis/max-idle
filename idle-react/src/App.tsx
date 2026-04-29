import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import "sonner/dist/styles.css";
import { AppShell } from "./app/AppShell";

function App() {
  return (
    <BrowserRouter>
      <Toaster
        theme="light"
        position="top-center"
        richColors
        closeButton
      />
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
