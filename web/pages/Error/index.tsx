import { Header } from "../../components/Header";
import { Title } from "../../components/Title";
import { errorWrap } from "../../load";
import "./style.css";
export function ErrorPage({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div class="page page-error">
      <Title>{title}</Title>
      <Header />
      <main>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </main>
    </div>
  );
}
export const NotFound = errorWrap(() => {
  return <ErrorPage title="404" subtitle="Not Found" />;
});
