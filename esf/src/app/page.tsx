import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Intro } from "@/components/intro/Intro";
import { QuemSomos } from "@/components/sections/QuemSomos";
import { Proposito } from "@/components/sections/Proposito";
import { Iniciativas } from "@/components/sections/Iniciativas";
import { Historia } from "@/components/sections/Historia";
import { Material } from "@/components/sections/Material";
import { FacaParte } from "@/components/sections/FacaParte";
import { Contato } from "@/components/sections/Contato";
import { Effects } from "@/components/motion/Effects";

export default function Home() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Intro />
        <QuemSomos />
        <Proposito />
        <Iniciativas />
        <Historia />
        <Material />
        <FacaParte />
        <Contato />
      </main>
      <Footer />
      <Effects />
    </>
  );
}
