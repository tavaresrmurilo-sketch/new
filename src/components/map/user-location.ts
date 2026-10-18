/**
 * Ponto azul pulsante da localização do usuário (com círculo de precisão),
 * como marcador HTML do MapLibre. Só é usado depois que a pessoa toca em "Perto de mim".
 */
import type { Map as MLMap, Marker } from "maplibre-gl";
import { ensureMapStyles } from "./markers";

type MapLibre = typeof import("maplibre-gl");

export interface UserPosition {
  lat: number;
  lng: number;
  /** Precisão em metros (raio), quando informada pelo navegador. */
  accuracy?: number | null;
}

/** Metros por pixel no zoom e latitude informados (tiles de 512 px do MapLibre). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

export class UserLocationMarker {
  private marker: Marker;
  private el: HTMLDivElement;
  private accuracyEl: HTMLSpanElement;
  private position: UserPosition;

  constructor(
    maplibre: MapLibre,
    private map: MLMap,
    position: UserPosition,
  ) {
    ensureMapStyles();
    this.position = position;
    this.el = document.createElement("div");
    this.el.className = "mx-me";
    this.el.setAttribute("role", "img");
    this.el.setAttribute("aria-label", "Sua localização");
    this.accuracyEl = document.createElement("span");
    this.accuracyEl.className = "mx-me__accuracy";
    const pulse = document.createElement("span");
    pulse.className = "mx-me__pulse";
    const dot = document.createElement("span");
    dot.className = "mx-me__dot";
    this.el.append(this.accuracyEl, pulse, dot);
    this.marker = new maplibre.Marker({ element: this.el, anchor: "center" }).setLngLat([position.lng, position.lat]).addTo(map);
    // abaixo dos pinos de eventos
    this.el.style.zIndex = "1";
    map.on("zoom", this.updateAccuracy);
    this.updateAccuracy();
  }

  setPosition(position: UserPosition) {
    this.position = position;
    this.marker.setLngLat([position.lng, position.lat]);
    this.updateAccuracy();
  }

  remove() {
    this.map.off("zoom", this.updateAccuracy);
    this.marker.remove();
  }

  private updateAccuracy = () => {
    const acc = this.position.accuracy;
    if (!acc || !Number.isFinite(acc)) {
      this.accuracyEl.style.display = "none";
      return;
    }
    const px = (2 * acc) / metersPerPixel(this.position.lat, this.map.getZoom());
    // muito pequeno (some sob o ponto) ou enorme (cobre a tela): esconde
    if (px < 26 || px > 600) {
      this.accuracyEl.style.display = "none";
      return;
    }
    this.accuracyEl.style.display = "block";
    this.accuracyEl.style.width = `${px}px`;
    this.accuracyEl.style.height = `${px}px`;
  };
}
