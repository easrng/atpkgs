import { useLocation } from "../../router.js";
import "./style.css";
import { Header } from "../../components/Header";
import { CloudAlertIcon } from "lucide-preact";
import { Title } from "../../components/Title";

let lastSearch: string | undefined;
export const SearchPage = () => {
  const location = useLocation();
  const search = location.path === "/search" ? location.query.q : lastSearch;
  lastSearch = search;
  return (
    <div class="page page-search">
      <Title>Search</Title>
      <Header searchValue={search} />
      <main class="search-unavailable">
        <CloudAlertIcon stroke-width={1} />
        <h2>Search is currently unavailable</h2>
        <p>Try typing a @handle</p>
      </main>
    </div>
  );
};
