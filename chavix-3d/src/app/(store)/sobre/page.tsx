import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { InfoPage } from "@/components/store/info-page";

export const metadata: Metadata = {
  title: "Sobre a CHAVIX 3D",
  description: "A CHAVIX 3D cria chaveiros originais em impressão 3D, produzidos sob demanda, camada por camada.",
  alternates: { canonical: "/sobre" },
};

const FACTS = [
  ["Processo", "Impressão 3D FDM, camada por camada"],
  ["Materiais", "PLA e PETG"],
  ["Produção", "Sob demanda, depois do pagamento"],
  ["Modelos", "Originais, desenhados pela CHAVIX"],
];

export default function AboutPage() {
  return (
    <InfoPage eyebrow="Sobre" title="Pequeno no tamanho. Grande na personalidade." intro="A CHAVIX 3D nasceu para transformar o que você gosta em um objeto que vai com você para todo lugar: na chave de casa, na mochila, no presente de alguém.">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div className="prose-chavix">
          <h2>Feito camada por camada</h2>
          <p>
            Cada chaveiro é impresso em 3D a partir de um modelo digital. A impressora deposita o material em camadas finíssimas, uma sobre a outra, até a peça ficar pronta. É por isso que você vê aquelas linhas delicadas na lateral: são a assinatura do processo.
          </p>
          <h2>Por que sob demanda</h2>
          <p>
            A gente imprime quando você pede. Assim você escolhe a cor, coloca o seu nome e nada fica parado em estoque. Menos desperdício, mais personalidade.
          </p>
          <h2>Modelos originais</h2>
          <p>
            Desenhamos nossos próprios modelos. Não vendemos personagens, logotipos ou marcas de terceiros sem autorização. Se você tem uma ideia, a gente cria com você em{" "}
            <Link href="/personalizar">Personalizar</Link>.
          </p>
        </div>
        <aside className="h-fit rounded-2xl border border-line bg-surface p-6">
          <dl className="divide-y divide-line">
            {FACTS.map(([label, value]) => (
              <div key={label} className="py-3 first:pt-0 last:pb-0">
                <dt className="spec text-muted">{label}</dt>
                <dd className="mt-1 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-col gap-2">
            <ButtonLink href="/produtos">Ver chaveiros</ButtonLink>
            <ButtonLink href="/personalizar" variant="outline">
              Criar meu chaveiro
            </ButtonLink>
          </div>
        </aside>
      </div>
    </InfoPage>
  );
}
