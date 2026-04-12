/**
 * App — root component wiring store to layout.
 */

import { useState } from "react";
import { useStore, type Store } from "./store.ts";
import Layout from "./layout.tsx";

interface AppProps {
  store: Store;
  onSubmit: (input: string) => void;
}

const App = ({ store, onSubmit }: AppProps) => {
  const state = useStore(store);
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
      setInput("");
    }
  };

  return (
    <Layout
      lines={state.lines}
      agent={state.agent}
      iteration={state.iteration}
      running={state.running}
      result={state.result}
      input={input}
      onInputChange={setInput}
      onSubmit={handleSubmit}
    />
  );
};

export default App;
