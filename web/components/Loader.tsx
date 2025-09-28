import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "preact/hooks";
import { Header } from "./Header";
import { Logo } from "./Logo";
import { errorWrap } from "../load";

export const Splash = errorWrap(() => {
	const ssr = typeof document === "undefined";
	return (
		<div
			class={"page page-loading-splash" + (ssr ? " ssr" : "")}
			{...ssr ? {} : { role: "presentation" }}
		>
			<Header />
			<main>
				<Logo />
				<noscript>
					<h2>This page requires JavaScript</h2>
				</noscript>
			</main>
		</div>
	);
});

let firstLoad = true;

export function Loader({ loading }: { loading: boolean }) {
	const [needsSplash, setNeedsSplash] = useState(false);
	const microtask = useRef(false);
	const timeout = useRef<null | number>(null);
	const [, rerender] = useState([]);
	useEffect(() => {
		if (timeout.current) clearTimeout(timeout.current);
		if (loading) {
			microtask.current = true;
			timeout.current = null;
			rerender([]);
		} else {
			microtask.current = false;
			timeout.current = Number(setTimeout(() => rerender([]), 1000));
		}
	}, [loading]);
	useLayoutEffect(() => {
		const hasPage = (typeof document !== "undefined") &&
			document.querySelector(".page");
		const wasFirstLoad = firstLoad;
		firstLoad = false;
		setNeedsSplash(!hasPage && wasFirstLoad);
	}, []);
	return (
		<>
			{microtask.current && (
				<div class={"page-loading" + (loading ? "" : " loaded")}>
					<div class="page-loading-gaslighting" />
				</div>
			)}
			{loading && needsSplash && <Splash />}
		</>
	);
}
