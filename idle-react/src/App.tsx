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
        offset={{ right: 16, bottom: 16 }}
        mobileOffset={{ right: 16, bottom: 16, left: 16 }}
        toastOptions={{
          style: {
            zIndex: 99999
          }
        }}
      />
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
