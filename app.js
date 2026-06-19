import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

const canvas = document.querySelector("#drawer-viewer");
const widthInput = document.querySelector("#widthInput");
const depthInput = document.querySelector("#depthInput");
const heightInput = document.querySelector("#heightInput");
const wallThicknessInput = document.querySelector("#wallThicknessInput");
const compartmentInput = document.querySelector("#compartmentInput");
const decreaseCompartments = document.querySelector("#decreaseCompartments");
const increaseCompartments = document.querySelector("#increaseCompartments");
const modeOptions = document.querySelectorAll(".mode-option");
const customGridControls = document.querySelector("#customGridControls");
const customWidthInput = document.querySelector("#customWidthInput");
const customDepthInput = document.querySelector("#customDepthInput");
const addCustomModuleButton = document.querySelector("#addCustomModule");
const clearCustomModulesButton = document.querySelector("#clearCustomModules");
const fillRemainingSpaceButton = document.querySelector("#fillRemainingSpace");
const customModuleList = document.querySelector("#customModuleList");
const validationMessage = document.querySelector("#validationMessage");
const highlightColorInput = document.querySelector("#highlightColorInput");
const fillRemainingModal = document.querySelector("#fillRemainingModal");
const confirmFillRemaining = document.querySelector("#confirmFillRemaining");
const volumeEstimate = document.querySelector("#volumeEstimate");
const weightEstimate = document.querySelector("#weightEstimate");
const compartmentEstimate = document.querySelector("#compartmentEstimate");
const dividerEstimate = document.querySelector("#dividerEstimate");
const priceEstimate = document.querySelector("#priceEstimate");
const swatches = document.querySelectorAll(".swatch");
const cartButton = document.querySelector("#cartButton");
const exportStatus = document.querySelector("#exportStatus");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9efe7);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4.5, 3.5, 5.5);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.25, 0);
controls.minDistance = 2.5;
controls.maxDistance = 10;

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x9cab9a, 2.2);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xdcebdd, 0.9);
fillLight.position.set(-5, 3, -3);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.ShadowMaterial({ color: 0x1a241c, opacity: 0.13 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.02;
floor.receiveShadow = true;
scene.add(floor);

const trayMaterial = new THREE.MeshStandardMaterial({
  color: 0x202321,
  roughness: 0.62,
  metalness: 0.04,
});

const highlightMaterial = new THREE.MeshStandardMaterial({
  color: 0x7bd39a,
  emissive: 0x22412c,
  roughness: 0.5,
  metalness: 0.02,
});

const highlightFillMaterial = new THREE.MeshBasicMaterial({
  color: 0x7bd39a,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const stlExporter = new STLExporter();
const DEFAULT_WALL_THICKNESS_MM = 8;

// Ajuste estes valores para calibrar o preço da loja.
// Mantive baixo para MVP: a ideia é dar uma estimativa comercial amigável,
// não um orçamento técnico de fatiador.
const PRICE_CONFIG = {
  fixedSetupBRL: 5,
  filamentBRLPerGram: 0.08,
  machineBRLPerHour: 1.8,
  dividerBRL: 0.25,
  compartmentBRL: 0.2,
  gramsPerHour: 38,
  materialDensityGPerCm3: 1.24,
  infillFactor: 0.42,
};

let trayGroup;
let dimensionGroup;
let currentMode = "equal";
let customModules = [];
let activeWallThicknessMm = DEFAULT_WALL_THICKNESS_MM;
let selectedModuleId = null;
let nextModuleId = 1;
let layoutLocked = false;

function millimetersToSceneUnits(value) {
  return value / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getConfig() {
  return {
    width: clamp(Number(widthInput.value) || 400, 200, 900),
    depth: clamp(Number(depthInput.value) || 300, 200, 900),
    height: clamp(Number(heightInput.value) || 60, 30, 150),
    wallThickness: clamp(Number(wallThicknessInput.value) || DEFAULT_WALL_THICKNESS_MM, 4, 20),
    compartments: clamp(Number(compartmentInput.value) || 1, 1, 8),
    customWidth: clamp(Number(customWidthInput.value) || 140, 60, 800),
    customDepth: clamp(Number(customDepthInput.value) || 120, 60, 800),
    mode: currentMode,
  };
}

function createPart(width, height, depth, x, y, z, material = trayMaterial) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function disposeGroup(group, disposeMaterials = false) {
  group.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (disposeMaterials && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) {
          material.map.dispose();
        }
        material.dispose();
      });
    }
  });
  scene.remove(group);
}

function setValidationMessage(message, isOk = false) {
  validationMessage.textContent = message;
  validationMessage.classList.toggle("is-ok", isOk);
}

function addVerticalDivider(group, xMm, zCenterMm, depthMm, wallHeight, floorThickness, material = trayMaterial) {
  group.add(
    createPart(
      millimetersToSceneUnits(activeWallThicknessMm),
      wallHeight * 0.94,
      millimetersToSceneUnits(depthMm),
      millimetersToSceneUnits(xMm),
      (wallHeight * 0.94) / 2 + floorThickness * 0.08,
      millimetersToSceneUnits(zCenterMm),
      material,
    ),
  );
}

function addHorizontalDivider(group, xCenterMm, zMm, widthMm, wallHeight, floorThickness, material = trayMaterial) {
  group.add(
    createPart(
      millimetersToSceneUnits(widthMm),
      wallHeight * 0.9,
      millimetersToSceneUnits(activeWallThicknessMm),
      millimetersToSceneUnits(xCenterMm),
      (wallHeight * 0.9) / 2 + floorThickness * 0.08,
      millimetersToSceneUnits(zMm),
      material,
    ),
  );
}

function createLabelTexture(text) {
  const canvasLabel = document.createElement("canvas");
  canvasLabel.width = 512;
  canvasLabel.height = 192;
  const context = canvasLabel.getContext("2d");

  context.clearRect(0, 0, canvasLabel.width, canvasLabel.height);
  context.fillStyle = "rgba(247, 248, 244, 0.96)";
  context.strokeStyle = "rgba(96, 127, 104, 0.85)";
  context.lineWidth = 7;
  context.roundRect(20, 26, 472, 140, 22);
  context.fill();
  context.stroke();

  context.fillStyle = "#101410";
  context.font = "800 50px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 96);

  const texture = new THREE.CanvasTexture(canvasLabel);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabelMaterial(text) {
  return new THREE.MeshBasicMaterial({
    map: createLabelTexture(text),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function createFloorLabel(text, width, height, x, z, rotationZ = 0) {
  const label = new THREE.Mesh(new THREE.PlaneGeometry(width, height), createLabelMaterial(text));
  label.rotation.set(-Math.PI / 2, 0, rotationZ);
  label.position.set(x, 0.035, z);
  return label;
}

function createVerticalLabel(text, x, y, z) {
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), createLabelMaterial(text));
  label.rotation.set(0, Math.PI / 4, 0);
  label.position.set(x, y, z);
  return label;
}

function addDoubleArrow(group, start, end, color = 0x607f68) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();

  if (length <= 0.01) {
    return;
  }

  direction.normalize();
  const headLength = Math.min(0.18, length * 0.18);
  const headWidth = headLength * 0.5;

  group.add(new THREE.ArrowHelper(direction, start, length, color, headLength, headWidth));
  group.add(new THREE.ArrowHelper(direction.clone().negate(), end, length, color, headLength, headWidth));
}

function rebuildDimensionGuides(config, outerWidth, outerDepth, outerHeight) {
  if (dimensionGroup) {
    disposeGroup(dimensionGroup, true);
  }

  dimensionGroup = new THREE.Group();
  const offset = 0.58;
  const y = 0.045;
  const color = 0x607f68;

  const widthZ = outerDepth / 2 + offset;
  addDoubleArrow(
    dimensionGroup,
    new THREE.Vector3(-outerWidth / 2, y, widthZ),
    new THREE.Vector3(outerWidth / 2, y, widthZ),
    color,
  );
  dimensionGroup.add(createFloorLabel(`${config.width} mm`, 1.1, 0.38, 0, widthZ + 0.32));

  const depthX = outerWidth / 2 + offset;
  addDoubleArrow(
    dimensionGroup,
    new THREE.Vector3(depthX, y, -outerDepth / 2),
    new THREE.Vector3(depthX, y, outerDepth / 2),
    color,
  );
  dimensionGroup.add(createFloorLabel(`${config.depth} mm`, 1.1, 0.38, depthX + 0.32, 0, -Math.PI / 2));

  const heightX = -outerWidth / 2 - offset;
  const heightZ = -outerDepth / 2;
  addDoubleArrow(
    dimensionGroup,
    new THREE.Vector3(heightX, 0, heightZ),
    new THREE.Vector3(heightX, outerHeight, heightZ),
    color,
  );
  dimensionGroup.add(createVerticalLabel(`${config.height} mm`, heightX - 0.35, outerHeight / 2, heightZ));

  scene.add(dimensionGroup);
}

function almostEqual(a, b, tolerance = 0.1) {
  return Math.abs(a - b) <= tolerance;
}

function addEqualDividers(group, config, innerWidthMm, innerDepthMm, wallHeight, floorThickness) {
  if (config.compartments <= 1) {
    return;
  }

  const spacing = innerWidthMm / config.compartments;

  for (let index = 1; index < config.compartments; index += 1) {
    const xMm = -innerWidthMm / 2 + spacing * index;
    addVerticalDivider(group, xMm, 0, innerDepthMm, wallHeight, floorThickness);
  }
}

function getEffectiveModuleSize(module, config, innerWidthMm, innerDepthMm) {
  if (module.width > config.width || module.depth > config.depth) {
    return {
      ok: false,
      message: `Compartimento ${module.width} x ${module.depth} mm maior que a gaveta.`,
    };
  }

  return {
    ok: true,
    width: Math.min(module.width, innerWidthMm),
    depth: Math.min(module.depth, innerDepthMm),
  };
}

function packCustomModules(modules, innerWidthMm, innerDepthMm, config = getConfig()) {
  const placements = [];
  let cursorX = 0;
  let cursorZ = 0;
  let rowDepth = 0;

  for (const module of modules) {
    const effectiveModule = getEffectiveModuleSize(module, config, innerWidthMm, innerDepthMm);

    if (!effectiveModule.ok) {
      return { ...effectiveModule, placements: [] };
    }

    const requiredWidth = effectiveModule.width;

    if (cursorX + requiredWidth <= innerWidthMm) {
      const x = cursorX;
      placements.push({ ...module, width: effectiveModule.width, depth: effectiveModule.depth, x, z: cursorZ });
      cursorX = x + effectiveModule.width;
      rowDepth = Math.max(rowDepth, effectiveModule.depth);
      continue;
    }

    cursorX = 0;
    cursorZ += rowDepth;
    rowDepth = effectiveModule.depth;

    if (cursorZ + effectiveModule.depth > innerDepthMm) {
      return {
        ok: false,
        message: "Nao foi possivel encaixar todos os compartimentos nessa gaveta.",
        placements: [],
      };
    }

    placements.push({ ...module, width: effectiveModule.width, depth: effectiveModule.depth, x: cursorX, z: cursorZ });
    cursorX = effectiveModule.width;
  }

  if (cursorZ + rowDepth > innerDepthMm) {
    return {
      ok: false,
      message: "Nao foi possivel encaixar todos os compartimentos nessa gaveta.",
      placements: [],
    };
  }

  return { ok: true, message: `${modules.length} compartimento(s) encaixado(s).`, placements };
}

function getRemainingSpaces(placements, innerWidthMm, innerDepthMm) {
  if (placements.length === 0) {
    return [
      {
        id: nextModuleId++,
        width: Math.round(innerWidthMm),
        depth: Math.round(innerDepthMm),
        splits: 1,
        generated: true,
      },
    ];
  }

  const minSpaceMm = Math.max(activeWallThicknessMm * 2, 24);
  const rows = [];

  placements.forEach((module) => {
    let row = rows.find((item) => almostEqual(item.z, module.z));

    if (!row) {
      row = { z: module.z, widthUsed: 0, depth: 0 };
      rows.push(row);
    }

    row.widthUsed = Math.max(row.widthUsed, module.x + module.width);
    row.depth = Math.max(row.depth, module.depth);
  });

  rows.sort((a, b) => a.z - b.z);

  const spaces = [];

  rows.forEach((row) => {
    const remainingWidth = innerWidthMm - row.widthUsed;

    if (remainingWidth >= minSpaceMm && row.depth >= minSpaceMm) {
      spaces.push({
        id: nextModuleId++,
        width: Math.round(remainingWidth),
        depth: Math.round(row.depth),
        splits: 1,
        generated: true,
      });
    }
  });

  const usedDepth = rows.reduce((max, row) => Math.max(max, row.z + row.depth), 0);
  const remainingDepth = innerDepthMm - usedDepth;

  if (remainingDepth >= minSpaceMm) {
    spaces.push({
      id: nextModuleId++,
      width: Math.round(innerWidthMm),
      depth: Math.round(remainingDepth),
      splits: 1,
      generated: true,
    });
  }

  return spaces;
}

function fillRemainingSpaces() {
  const config = getConfig();
  const innerWidthMm = config.width - config.wallThickness * 2;
  const innerDepthMm = config.depth - config.wallThickness * 2;
  const result = packCustomModules(customModules, innerWidthMm, innerDepthMm, config);

  if (!result.ok) {
    setValidationMessage(result.message);
    return;
  }

  const remainingSpaces = getRemainingSpaces(result.placements, innerWidthMm, innerDepthMm);

  if (remainingSpaces.length === 0) {
    setValidationMessage("Nao existe espaco restante grande o suficiente para fechar.", true);
    return;
  }

  customModules = [...customModules, ...remainingSpaces];
  selectedModuleId = remainingSpaces[0].id;
  layoutLocked = true;
  renderCustomModuleList();
  rebuildTray();
  setValidationMessage("Espaco restante fechado. Limpe o layout para editar novamente.", true);
}

function addEdge(edges, orientation, coord, start, end, minLimit, maxLimit) {
  if (almostEqual(coord, minLimit) || almostEqual(coord, maxLimit) || Math.abs(end - start) < 0.1) {
    return;
  }

  edges.push({
    orientation,
    coord: Number(coord.toFixed(3)),
    start: Math.min(start, end),
    end: Math.max(start, end),
  });
}

function mergeSegments(edges) {
  const groups = new Map();

  edges.forEach((edge) => {
    const key = `${edge.orientation}:${edge.coord}`;
    const list = groups.get(key) || [];
    list.push(edge);
    groups.set(key, list);
  });

  const merged = [];

  groups.forEach((segments) => {
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    let current = { ...sorted[0] };

    sorted.slice(1).forEach((segment) => {
      if (segment.start <= current.end + activeWallThicknessMm) {
        current.end = Math.max(current.end, segment.end);
        return;
      }

      merged.push(current);
      current = { ...segment };
    });

    merged.push(current);
  });

  return merged;
}

function buildConnectedCustomDividers(placements, innerWidthMm, innerDepthMm) {
  const edges = [];
  const minX = -innerWidthMm / 2;
  const maxX = innerWidthMm / 2;
  const minZ = -innerDepthMm / 2;
  const maxZ = innerDepthMm / 2;

  placements.forEach((module) => {
    const left = minX + module.x;
    const right = left + module.width;
    const front = maxZ - module.z;
    const back = front - module.depth;

    addEdge(edges, "vertical", left, back, front, minX, maxX);
    addEdge(edges, "vertical", right, back, front, minX, maxX);
    addEdge(edges, "horizontal", front, left, right, minZ, maxZ);
    addEdge(edges, "horizontal", back, left, right, minZ, maxZ);

    if (module.splits > 1) {
      for (let index = 1; index < module.splits; index += 1) {
        if (module.depth >= module.width) {
          const splitZ = front - (module.depth / module.splits) * index;
          addEdge(edges, "horizontal", splitZ, left, right, minZ, maxZ);
        } else {
          const splitX = left + (module.width / module.splits) * index;
          addEdge(edges, "vertical", splitX, back, front, minX, maxX);
        }
      }
    }
  });

  return mergeSegments(edges);
}

function addModuleHighlight(group, module, innerWidthMm, innerDepthMm, wallHeight, floorThickness) {
  const minX = -innerWidthMm / 2;
  const maxZ = innerDepthMm / 2;
  const left = minX + module.x;
  const front = maxZ - module.z;
  const centerX = left + module.width / 2;
  const centerZ = front - module.depth / 2;

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(millimetersToSceneUnits(module.width), millimetersToSceneUnits(module.depth)),
    highlightFillMaterial,
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(millimetersToSceneUnits(centerX), floorThickness + 0.006, millimetersToSceneUnits(centerZ));
  group.add(fill);

  const highlightEdges = buildConnectedCustomDividers([module], innerWidthMm, innerDepthMm);

  highlightEdges.forEach((divider) => {
    const length = divider.end - divider.start;
    const center = divider.start + length / 2;

    if (divider.orientation === "vertical") {
      addVerticalDivider(group, divider.coord, center, length, wallHeight * 1.01, floorThickness, highlightMaterial);
      return;
    }

    addHorizontalDivider(group, center, divider.coord, length, wallHeight * 1.01, floorThickness, highlightMaterial);
  });
}

function addCustomDividers(group, config, innerWidthMm, innerDepthMm, wallHeight, floorThickness) {
  if (customModules.length === 0) {
    setValidationMessage("Adicione um compartimento personalizado para desenhar as divisorias.");
    return;
  }

  const result = packCustomModules(customModules, innerWidthMm, innerDepthMm, config);

  if (!result.ok) {
    setValidationMessage(result.message);
    return;
  }

  setValidationMessage(result.message, true);

  const dividers = buildConnectedCustomDividers(result.placements, innerWidthMm, innerDepthMm);

  dividers.forEach((divider) => {
    const length = divider.end - divider.start;
    const center = divider.start + length / 2;

    if (divider.orientation === "vertical") {
      addVerticalDivider(group, divider.coord, center, length, wallHeight, floorThickness);
      return;
    }

    addHorizontalDivider(group, center, divider.coord, length, wallHeight, floorThickness);
  });

  const selectedPlacement = result.placements.find((module) => module.id === selectedModuleId);

  if (selectedPlacement) {
    addModuleHighlight(group, selectedPlacement, innerWidthMm, innerDepthMm, wallHeight, floorThickness);
  }
}

function getLayoutStats(config, innerWidthMm, innerDepthMm) {
  if (config.mode !== "custom") {
    const dividerCount = Math.max(config.compartments - 1, 0);
    return {
      ok: true,
      compartmentCount: config.compartments,
      dividerCount,
      dividerVolumeMm3: dividerCount * config.wallThickness * innerDepthMm * config.height * 0.94,
    };
  }

  const result = packCustomModules(customModules, innerWidthMm, innerDepthMm, config);

  if (!result.ok) {
    return {
      ok: false,
      compartmentCount: 0,
      dividerCount: 0,
      dividerVolumeMm3: 0,
    };
  }

  const dividers = buildConnectedCustomDividers(result.placements, innerWidthMm, innerDepthMm);
  const compartmentCount = result.placements.reduce((total, module) => total + (module.splits || 1), 0);
  const dividerVolumeMm3 = dividers.reduce((total, divider) => {
    return total + (divider.end - divider.start) * config.wallThickness * config.height * 0.92;
  }, 0);

  return {
    ok: true,
    compartmentCount,
    dividerCount: dividers.length,
    dividerVolumeMm3,
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function updatePriceEstimate(config, innerWidthMm, innerDepthMm) {
  const floorThicknessMm = Math.min(config.wallThickness, config.height * 0.35);
  const baseVolumeMm3 = config.width * config.depth * floorThicknessMm;
  const outerWallsVolumeMm3 =
    2 * config.width * config.wallThickness * config.height +
    2 * config.wallThickness * config.depth * config.height;
  const stats = getLayoutStats(config, innerWidthMm, innerDepthMm);
  const totalVolumeMm3 = baseVolumeMm3 + outerWallsVolumeMm3 + stats.dividerVolumeMm3;
  const volumeCm3 = totalVolumeMm3 / 1000;
  const estimatedGrams = volumeCm3 * PRICE_CONFIG.materialDensityGPerCm3 * PRICE_CONFIG.infillFactor;
  const estimatedHours = Math.max(
    0.6,
    estimatedGrams / PRICE_CONFIG.gramsPerHour + stats.dividerCount * 0.025 + stats.compartmentCount * 0.015,
  );
  const price =
    PRICE_CONFIG.fixedSetupBRL +
    estimatedGrams * PRICE_CONFIG.filamentBRLPerGram +
    estimatedHours * PRICE_CONFIG.machineBRLPerHour +
    stats.dividerCount * PRICE_CONFIG.dividerBRL +
    stats.compartmentCount * PRICE_CONFIG.compartmentBRL;

  volumeEstimate.textContent = `${volumeCm3.toFixed(1)} cm3`;
  weightEstimate.textContent = `${estimatedGrams.toFixed(0)} g`;
  compartmentEstimate.textContent = String(stats.compartmentCount);
  dividerEstimate.textContent = String(stats.dividerCount);
  priceEstimate.textContent = formatCurrency(price);

  return {
    volumeCm3,
    estimatedGrams,
    estimatedHours,
    price,
    ...stats,
  };
}

function rebuildTray() {
  const config = getConfig();
  widthInput.value = config.width;
  depthInput.value = config.depth;
  heightInput.value = config.height;
  wallThicknessInput.value = config.wallThickness;
  compartmentInput.value = config.compartments;
  customWidthInput.value = config.customWidth;
  customDepthInput.value = config.customDepth;
  activeWallThicknessMm = config.wallThickness;

  const outerWidth = millimetersToSceneUnits(config.width);
  const outerDepth = millimetersToSceneUnits(config.depth);
  const outerHeight = millimetersToSceneUnits(config.height);
  const wallThickness = millimetersToSceneUnits(config.wallThickness);
  const floorThickness = Math.min(wallThickness, outerHeight * 0.35);
  const wallHeight = outerHeight;
  const innerWidthMm = Math.max(config.width - config.wallThickness * 2, config.wallThickness);
  const innerDepthMm = Math.max(config.depth - config.wallThickness * 2, config.wallThickness);

  if (trayGroup) {
    disposeGroup(trayGroup);
  }

  trayGroup = new THREE.Group();
  trayGroup.add(createPart(outerWidth, floorThickness, outerDepth, 0, floorThickness / 2, 0));
  trayGroup.add(createPart(outerWidth, wallHeight, wallThickness, 0, wallHeight / 2, -outerDepth / 2 + wallThickness / 2));
  trayGroup.add(createPart(outerWidth, wallHeight, wallThickness, 0, wallHeight / 2, outerDepth / 2 - wallThickness / 2));
  trayGroup.add(createPart(wallThickness, wallHeight, outerDepth, -outerWidth / 2 + wallThickness / 2, wallHeight / 2, 0));
  trayGroup.add(createPart(wallThickness, wallHeight, outerDepth, outerWidth / 2 - wallThickness / 2, wallHeight / 2, 0));

  if (config.mode === "custom") {
    addCustomDividers(trayGroup, config, innerWidthMm, innerDepthMm, wallHeight, floorThickness);
  } else {
    setValidationMessage("");
    addEqualDividers(trayGroup, config, innerWidthMm, innerDepthMm, wallHeight, floorThickness);
  }

  scene.add(trayGroup);
  rebuildDimensionGuides(config, outerWidth, outerDepth, outerHeight);
  updatePriceEstimate(config, innerWidthMm, innerDepthMm);
  controls.target.set(0, outerHeight / 2, 0);
}

function buildCheckoutOrder() {
  const config = getConfig();
  const innerWidthMm = config.width - config.wallThickness * 2;
  const innerDepthMm = config.depth - config.wallThickness * 2;
  const estimate = updatePriceEstimate(config, innerWidthMm, innerDepthMm);

  return {
    createdAt: new Date().toISOString(),
    productName: "Organizador de Gaveta",
    config,
    modules: customModules,
    estimate,
  };
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = canvas.parentElement;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function createFileName(config) {
  const modeName = config.mode === "custom" ? `${customModules.length}-personalizados` : `${config.compartments}-compartimentos`;
  return `organizador-gaveta-${config.width}x${config.depth}x${config.height}mm-${modeName}.stl`;
}

function downloadTextFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportConfiguredTray() {
  if (!trayGroup) {
    exportStatus.textContent = "Modelo ainda nao esta pronto para exportar.";
    return;
  }

  const config = getConfig();

  if (config.mode === "custom") {
    const innerWidthMm = config.width - config.wallThickness * 2;
    const innerDepthMm = config.depth - config.wallThickness * 2;
    const result = packCustomModules(customModules, innerWidthMm, innerDepthMm, config);

    if (!result.ok || customModules.length === 0) {
      exportStatus.textContent = "Corrija o layout personalizado antes de exportar.";
      return;
    }
  }

  const stlString = stlExporter.parse(trayGroup, { binary: false });
  const fileName = createFileName(config);

  downloadTextFile(fileName, stlString, "model/stl;charset=utf-8");
  exportStatus.textContent = `STL gerado: ${fileName}`;
}

function updateCustomControlsState() {
  addCustomModuleButton.disabled = layoutLocked;
  fillRemainingSpaceButton.disabled = layoutLocked;
  customWidthInput.disabled = layoutLocked;
  customDepthInput.disabled = layoutLocked;
}

function renderCustomModuleList() {
  customModuleList.innerHTML = "";

  if (customModules.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty";
    emptyItem.textContent = "Nenhum compartimento adicionado.";
    customModuleList.appendChild(emptyItem);
    updateCustomControlsState();
    return;
  }

  if (!customModules.some((module) => module.id === selectedModuleId)) {
    selectedModuleId = customModules[0].id;
  }

  customModules.forEach((module, index) => {
    const item = document.createElement("li");
    const summary = document.createElement("div");
    const title = document.createElement("strong");
    const dimensions = document.createElement("span");
    const controls = document.createElement("div");
    const splitLabel = document.createElement("label");
    const splitText = document.createElement("span");
    const splitSelect = document.createElement("select");
    const removeButton = document.createElement("button");

    item.classList.toggle("is-selected", module.id === selectedModuleId);
    item.classList.toggle("is-locked", layoutLocked);
    item.addEventListener("click", () => {
      selectedModuleId = module.id;
      renderCustomModuleList();
      rebuildTray();
    });

    summary.className = "module-summary";
    title.textContent = module.generated ? `Espaco restante ${index + 1}` : `Compartimento ${index + 1}`;
    dimensions.textContent = `${module.width} x ${module.depth} mm`;
    summary.append(title, dimensions);

    controls.className = "module-controls";
    splitText.textContent = "Dividir em";
    [1, 2, 3, 4, 5].forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = value === 1 ? "sem divisao" : `${value} partes`;
      option.selected = (module.splits || 1) === value;
      splitSelect.appendChild(option);
    });
    splitSelect.addEventListener("change", () => {
      customModules = customModules.map((customModule, moduleIndex) => {
        if (moduleIndex !== index) {
          return customModule;
        }

        return {
          ...customModule,
          splits: Number(splitSelect.value),
        };
      });
      renderCustomModuleList();
      rebuildTray();
    });
    splitLabel.append(splitText, splitSelect);

    removeButton.type = "button";
    removeButton.textContent = "x";
    removeButton.disabled = layoutLocked;
    removeButton.setAttribute("aria-label", `Remover compartimento ${index + 1}`);
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (layoutLocked) {
        return;
      }
      customModules = customModules.filter((_, moduleIndex) => moduleIndex !== index);
      if (selectedModuleId === module.id) {
        selectedModuleId = customModules[0]?.id || null;
      }
      renderCustomModuleList();
      rebuildTray();
    });

    controls.append(splitLabel);
    item.append(summary, controls, removeButton);
    customModuleList.appendChild(item);
  });

  updateCustomControlsState();
}

[widthInput, depthInput, heightInput, wallThicknessInput, compartmentInput, customWidthInput, customDepthInput].forEach((input) => {
  input.addEventListener("input", rebuildTray);
});

decreaseCompartments.addEventListener("click", () => {
  compartmentInput.value = clamp(Number(compartmentInput.value) - 1, 1, 8);
  rebuildTray();
});

increaseCompartments.addEventListener("click", () => {
  compartmentInput.value = clamp(Number(compartmentInput.value) + 1, 1, 8);
  rebuildTray();
});

modeOptions.forEach((option) => {
  option.addEventListener("click", () => {
    currentMode = option.dataset.mode;
    modeOptions.forEach((item) => item.classList.remove("is-active"));
    option.classList.add("is-active");
    customGridControls.classList.toggle("is-visible", currentMode === "custom");
    renderCustomModuleList();
    rebuildTray();
  });
});

addCustomModuleButton.addEventListener("click", () => {
  if (layoutLocked) {
    setValidationMessage("Limpe o layout para adicionar novos compartimentos.");
    return;
  }

  const config = getConfig();
  const moduleId = nextModuleId++;
  const nextModules = [
    ...customModules,
    {
      id: moduleId,
      width: config.customWidth,
      depth: config.customDepth,
      splits: 1,
    },
  ];

  const innerWidthMm = config.width - config.wallThickness * 2;
  const innerDepthMm = config.depth - config.wallThickness * 2;
  const result = packCustomModules(nextModules, innerWidthMm, innerDepthMm, config);

  if (!result.ok) {
    setValidationMessage(result.message);
    return;
  }

  customModules = nextModules;
  selectedModuleId = moduleId;
  renderCustomModuleList();
  rebuildTray();
});

clearCustomModulesButton.addEventListener("click", () => {
  customModules = [];
  selectedModuleId = null;
  layoutLocked = false;
  renderCustomModuleList();
  rebuildTray();
});

fillRemainingSpaceButton.addEventListener("click", () => {
  if (currentMode !== "custom") {
    setValidationMessage("Use o modo Personalizado para fechar o espaco restante.");
    return;
  }

  if (layoutLocked) {
    setValidationMessage("O layout ja esta fechado. Limpe para editar novamente.");
    return;
  }

  if (fillRemainingModal?.showModal) {
    fillRemainingModal.showModal();
    return;
  }

  if (window.confirm("Fechar o espaco restante e travar o layout?")) {
    fillRemainingSpaces();
  }
});

confirmFillRemaining.addEventListener("click", () => {
  fillRemainingSpaces();
});

highlightColorInput.addEventListener("input", () => {
  highlightMaterial.color.set(highlightColorInput.value);
  highlightMaterial.emissive.set(highlightColorInput.value);
  highlightFillMaterial.color.set(highlightColorInput.value);
  rebuildTray();
});

swatches.forEach((swatch) => {
  swatch.addEventListener("click", () => {
    trayMaterial.color.setHex(Number(swatch.dataset.color));
    swatches.forEach((item) => item.classList.remove("is-active"));
    swatch.classList.add("is-active");
  });
});

cartButton.addEventListener("click", () => {
  localStorage.setItem("organize3dCheckout", JSON.stringify(buildCheckoutOrder()));
  exportConfiguredTray();
  window.location.href = "./carrinho.html";
});

window.addEventListener("resize", resizeRenderer);

renderCustomModuleList();
rebuildTray();
resizeRenderer();
animate();
