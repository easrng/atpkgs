import { useContext } from "preact/hooks";
import { TitleContext } from "..";

export function Title({ children }: { children: string }) {
  const setTitle = useContext(TitleContext);
  setTitle(children ? children + " – atpkgs" : "atpkgs");
  return null;
}
