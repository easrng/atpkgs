import { AccountButton } from "./AccountButton";
import { Logo } from "./Logo";
import { Search } from "./Search";

export function Header({ searchValue }: { searchValue?: string | undefined }) {
  return (
    <header>
      <div class="header-inner">
        <h1>
          <a href="/">
            <Logo />
            atpkgs
          </a>
        </h1>
        <Search value={searchValue} />
        <AccountButton />
      </div>
    </header>
  );
}
