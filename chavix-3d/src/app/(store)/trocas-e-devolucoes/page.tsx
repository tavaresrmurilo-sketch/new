import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/store/info-page";

export const metadata: Metadata = {
  title: "Trocas e devoluções",
  description: "Como trocar ou devolver um produto da CHAVIX 3D.",
  alternates: { canonical: "/trocas-e-devolucoes" },
};

export default function ReturnsPage() {
  return (
    <InfoPage eyebrow="Trocas e devoluções" title="Deu algo errado? A gente resolve." updated="30 de setembro de 2026">
      <div className="prose-chavix">
        <h2>Arrependimento (até 7 dias)</h2>
        <p>
          Compras feitas pela internet podem ser desistidas em até 7 dias corridos após o recebimento, conforme o Código de Defesa do Consumidor (art. 49). O produto deve voltar sem sinais de uso. Devolvemos o valor pago, incluindo o frete de envio, pelo mesmo meio (Pix).
        </p>

        <h2>Defeito ou erro nosso</h2>
        <p>
          Se o chaveiro chegar quebrado, com defeito de impressão, na cor errada ou com o texto diferente do que você pediu, avise em até 30 dias do recebimento com fotos. Refazemos a peça sem custo ou devolvemos o valor, como você preferir.
        </p>

        <h2>Personalizados</h2>
        <p>
          Chaveiros personalizados são feitos especialmente para você. Antes da produção, revisamos o pedido com cuidado. Em caso de defeito ou erro nosso, valem as mesmas garantias acima. Para desistência de personalizados, fale com a gente antes do início da produção.
        </p>

        <h2>Como solicitar</h2>
        <ul>
          <li>Tenha em mãos o código do pedido (ex.: CHX-A82F91).</li>
          <li>Fale com a gente pela página de <Link href="/contato">Contato</Link>.</li>
          <li>Enviamos as instruções de postagem ou combinamos a retirada.</li>
        </ul>
      </div>
    </InfoPage>
  );
}
