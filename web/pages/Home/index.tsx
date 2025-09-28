import { AtSign } from "lucide-preact";
import { AccountButton } from "../../components/AccountButton";
import { Logo } from "../../components/Logo";
import { Search } from "../../components/Search";
import { Title } from "../../components/Title";
import "./style.css";
import { errorWrap } from "../../load";

export const Home = errorWrap(() => {
	return (
		<div class="page page-home">
			<Title>{""}</Title>
			<header>
				<h1>
					<Logo />
					atpkgs
				</h1>
				<h2>
					A decentralized package registry for JavaScript and TypeScript, built
					on{" "}
					<a href="https://atproto.com/" class="atproto-logo">
						<span class="atproto-logo-at-symbol">
							<AtSign />
						</span>
						<span class="atproto-logo-at-text">AT</span>Protocol
					</a>.
				</h2>
				<Search />
				<AccountButton big={true} />
			</header>
		</div>
	);
});
