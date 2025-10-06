import { AtSign } from "lucide-preact";
import { AccountButton } from "../../components/AccountButton";
import { Logo } from "../../components/Logo";
import { Search } from "../../components/Search";
import { Title } from "../../components/Title";
import "./style.css";
import { errorWrap } from "../../load";

export const Home = errorWrap(() => {
  return (
    <main class="page page-home">
      <Title>{""}</Title>
      <header>
        <div class="home-header-inner">
          <h1>
            <Logo />
            atpkgs
          </h1>
          {/* p tag for semantic subtitle */}
          <p class="subtitle">
            A decentralized package registry for JavaScript and TypeScript,
            built on{" "}
            <a href="https://atproto.com/" class="atproto-logo">
              <span class="atproto-logo-at-symbol">
                <AtSign />
              </span>

              <span class="atproto-logo-at-text">AT</span>Protocol
            </a>.
          </p>
        </div>
        <nav>
          <Search />
          <div class="buttons">
            <AccountButton big={true} />
          </div>
        </nav>
      </header>
      <section>
        <h2>NPM Compatible</h2>
        <p>
          Atpkgs is compatible with the NPM Registry API, so it works with most
          Node.js package managers.
        </p>
        <h2>Publish a Package</h2>
        <p>
          To publish a package, run <code>npx atpkgs publish</code>{" "}
          in your package's directory.
        </p>
        <h2>Lorem ipsum</h2>
        <p>
          dolor sit amet consectetur adipisicing elit. Sunt voluptas est totam
          id nesciunt blanditiis voluptatum cupiditate velit quasi perferendis
          hic.
        </p>
      </section>
    </main>
  );
});
