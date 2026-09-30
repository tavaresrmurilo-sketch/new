/** Perguntas frequentes (usadas na home e em /faq). */
export const FAQ: Array<{ q: string; a: string; group: "Pedidos" | "Pagamento" | "Produção" | "Entrega" | "Personalizados" }> = [
  {
    group: "Produção",
    q: "Como os chaveiros são feitos?",
    a: "Em impressoras 3D FDM, que depositam o material camada por camada (0,2 mm cada). Depois da impressão, cada peça é revisada, recebe a argola e é embalada.",
  },
  {
    group: "Produção",
    q: "Qual é o material?",
    a: "Usamos PLA, um plástico de origem vegetal, e PETG, mais resistente a calor e impacto. O material de cada modelo aparece na página do produto.",
  },
  {
    group: "Produção",
    q: "Quanto tempo leva para ficar pronto?",
    a: "Cada produto mostra o prazo de produção em dias úteis, contado a partir da confirmação do pagamento. Itens de pronta entrega saem mais rápido.",
  },
  {
    group: "Pagamento",
    q: "Como funciona o pagamento?",
    a: "O pagamento é via Pix. Ao finalizar o pedido, você recebe um QR Code e o código Pix Copia e Cola com o valor exato. Depois de pagar, toque em “Já fiz o pagamento” e a gente confere.",
  },
  {
    group: "Pagamento",
    q: "Meu pagamento é confirmado na hora?",
    a: "Não automaticamente. Conferimos cada Pix no extrato e confirmamos manualmente, normalmente em poucas horas no horário comercial. Você acompanha o status pelo código do pedido.",
  },
  {
    group: "Personalizados",
    q: "Posso pedir um chaveiro com o meu nome ou desenho?",
    a: "Pode. Em Personalizar você escolhe formato, cor, escreve o texto e pode enviar uma imagem de referência. Pedidos personalizados passam por análise antes da produção.",
  },
  {
    group: "Personalizados",
    q: "Vocês fazem personagens e marcas famosas?",
    a: "Não produzimos personagens, logotipos ou marcas de terceiros sem autorização dos donos. Criamos modelos originais inspirados no que você gosta.",
  },
  {
    group: "Entrega",
    q: "Quais são as formas de entrega?",
    a: "Retirada combinada, entrega local nas cidades atendidas e envio para todo o Brasil. As opções e valores aparecem no checkout, conforme o seu CEP.",
  },
  {
    group: "Pedidos",
    q: "Como acompanho meu pedido?",
    a: "Em Acompanhar pedido, informe o código (ex.: CHX-A82F91) e o e-mail ou telefone usado na compra. A linha do tempo mostra cada etapa.",
  },
  {
    group: "Pedidos",
    q: "Posso trocar ou devolver?",
    a: "Sim. Produtos do catálogo podem ser devolvidos em até 7 dias após o recebimento. Personalizados só são trocados em caso de defeito ou erro nosso. Veja a política completa em Trocas e devoluções.",
  },
];
