//* Global variables
let scene,
  camera,
  renderer,
  spacecraft,
  controls,
  engineGlow,
  starField,
  planetsGroup,
  centralBody;
let orbitTrail, orbitTrailPoints;
let isPaused = false;
let timeScale = 1.0;
let isFollowingSpacecraft = false;
let trajectoryLine;
let minPeriapsis = Infinity;
let maxApoapsis = 0;
const clock = new THREE.Clock();

const G_SIM = 20;
let centralBodyMass_SIM = 20000;
let spacecraftMass_SIM = 1;
let spacecraftVelocity_SIM = new THREE.Vector3();
let spacecraftPosition_SIM = new THREE.Vector3();
let simulationTimeStep = 0.016;

const G_REAL = 6.6743e-11;
const EARTH_MASS_REAL = 5.972e24;
const EARTH_RADIUS_KM = 6371;
const TARGET_BODY_LENGTH_SIM_UNITS = 1.5; // Moved from createSpacecraft to global scope

const DISTANCE_SIM_UNITS_PER_KM = 1 / 75;
const VELOCITY_SIM_UNITS_PER_KMS = 8.5;

let scMassSlider, orbDistSlider, initVelSlider;
let scMassValue, orbDistValue, initVelValue;
let gravForceDisplay, scVelDisplay, distEarthDisplay, earthMassDisplay;
let resetButton;

let cameraOffset = new THREE.Vector3(0, 8, 35); // Increased default distance
let cameraUp = new THREE.Vector3(0, 1, 0);
let smoothFactor = 0.028;
const CAMERA_OFFSET_MIN = 15; // Increased minimum distance
const CAMERA_OFFSET_MAX = 300;
const ROTATION_SPEED = Math.PI / 90;
const VELOCITY_LEAD = 0.25;
const SPACECRAFT_ROTATION_SPEED = 0.18;
const VELOCITY_ANTICIPATION = 0.15;
const SMOOTH_LOOK_MULTIPLIER = 0.7;
const UP_VECTOR_SMOOTH_MULTIPLIER = 0.6;
const MIN_FOLLOW_DISTANCE = 20; // Minimum following distance
const VELOCITY_DISTANCE_FACTOR = 0.5; // How much velocity affects distance
const ACCELERATION_DISTANCE_FACTOR = 2.0; // How much acceleration affects distance

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);

  const canvasWidth = window.innerWidth - 320;
  const canvasHeight = window.innerHeight;

  camera = new THREE.PerspectiveCamera(
    75,
    canvasWidth / canvasHeight,
    0.1,
    10000
  );
  camera.position.set(70, 42, 70);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvasWidth, canvasHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0x707080, 0.6); // Slightly adjusted ambient
  scene.add(ambientLight);
  const pointLight = new THREE.PointLight(0xfff0e0, 1.5, 4000); // Adjusted intensity and range
  pointLight.castShadow = true;

  createCentralBody(pointLight);
  createStarfield();
  createPlanets();
  createSpacecraft();
  setupUIControls();

  resetSimulation();
  createOrbitTrail();
  createTrajectoryLine();
  setupCameraControls();

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = centralBody.geometry.parameters.radius * 1.1; // Prevent clipping into Earth
  controls.maxDistance = 6000; // Allow zooming out to see distant planets
  controls.target.set(0, 0, 0);

  window.addEventListener("resize", onWindowResize, false);
  animate();
}

function setupUIControls() {
  scMassSlider = document.getElementById("scMassSlider");
  orbDistSlider = document.getElementById("orbDistSlider");
  initVelSlider = document.getElementById("initVelSlider");
  scMassValue = document.getElementById("scMassValue");
  orbDistValue = document.getElementById("orbDistValue");
  initVelValue = document.getElementById("initVelValue");
  resetButton = document.getElementById("resetButton");

  const timeScaleSlider = document.getElementById("timeScaleSlider");
  const timeScaleValue = document.getElementById("timeScaleValue");
  const pauseButton = document.getElementById("pauseButton");

  gravForceDisplay = document.getElementById("gravForceDisplay");
  scVelDisplay = document.getElementById("scVelDisplay");
  distEarthDisplay = document.getElementById("distEarthDisplay");
  earthMassDisplay = document.getElementById("earthMassDisplay");

  earthMassDisplay.textContent = EARTH_MASS_REAL.toExponential(2) + " kg";

  function updateSliderDisplay(slider, display, unit, decimals = 1) {
    display.textContent = parseFloat(slider.value).toFixed(decimals) + unit;
  }

  scMassSlider.addEventListener("input", () =>
    updateSliderDisplay(scMassSlider, scMassValue, " tons")
  );
  orbDistSlider.addEventListener("input", () =>
    updateSliderDisplay(orbDistSlider, orbDistValue, " km", 0)
  );
  initVelSlider.addEventListener("input", () =>
    updateSliderDisplay(initVelSlider, initVelValue, " km/s", 2)
  );
  timeScaleSlider.addEventListener("input", () => {
    timeScale = parseFloat(timeScaleSlider.value);
    updateSliderDisplay(timeScaleSlider, timeScaleValue, "x", 1);
  });

  updateSliderDisplay(scMassSlider, scMassValue, " tons");
  updateSliderDisplay(orbDistSlider, orbDistValue, " km", 0);
  updateSliderDisplay(initVelSlider, initVelValue, " km/s", 2);
  updateSliderDisplay(timeScaleSlider, timeScaleValue, "x", 1);

  resetButton.addEventListener("click", resetSimulation);

  pauseButton.addEventListener("click", () => {
    isPaused = !isPaused;
    pauseButton.textContent = isPaused ? "Resume" : "Pause";
    pauseButton.classList.toggle("paused", isPaused);
    if (!isPaused) {
      // Reset the clock delta to prevent large time jump
      clock.getDelta();
    }
  });
}

function resetSimulation() {
  const realOrbDistKm = parseFloat(orbDistSlider.value);
  const realInitVelKms = parseFloat(initVelSlider.value);

  spacecraftPosition_SIM.set(realOrbDistKm * DISTANCE_SIM_UNITS_PER_KM, 0, 0);
  spacecraftVelocity_SIM.set(0, 0, realInitVelKms * VELOCITY_SIM_UNITS_PER_KMS);

  if (spacecraft) {
    spacecraft.position.copy(spacecraftPosition_SIM);
    // Ensure spacecraft is visible and not inside Earth at reset
    const minSafeDistance = centralBody.geometry.parameters.radius * 1.05;
    if (spacecraft.position.length() < minSafeDistance) {
      spacecraft.position.setLength(minSafeDistance);
    }
  }

  // Clear orbit trail
  if (orbitTrailPoints) {
    orbitTrailPoints.length = 0;
    orbitTrail.geometry.setFromPoints([]);
  }

  // Reset time-related variables
  clock.elapsedTime = 0;
  isPaused = false;
  const pauseButton = document.getElementById("pauseButton");
  if (pauseButton) {
    pauseButton.textContent = "Pause";
    pauseButton.classList.remove("paused");
  }
  minPeriapsis = Infinity;
  maxApoapsis = 0;
}

function createCentralBody(lightToAttach) {
  const earthRadiusSimUnits = EARTH_RADIUS_KM * DISTANCE_SIM_UNITS_PER_KM;
  const starGeometry = new THREE.SphereGeometry(earthRadiusSimUnits, 64, 64);
  const starMaterial = new THREE.MeshPhongMaterial({
    color: 0x4d91ff,
    shininess: 15,
  });
  centralBody = new THREE.Mesh(starGeometry, starMaterial);
  centralBody.position.set(0, 0, 0);
  centralBody.receiveShadow = true; // Earth can receive shadows (e.g. from spacecraft)
  scene.add(centralBody);
  if (lightToAttach) centralBody.add(lightToAttach);
}

function createStarfield() {
  const starCount = 8000; // Increased star count
  const starVertices = [];
  for (let i = 0; i < starCount; i++) {
    const x = THREE.MathUtils.randFloatSpread(10000); // Spread stars further
    const y = THREE.MathUtils.randFloatSpread(10000);
    const z = THREE.MathUtils.randFloatSpread(10000);
    if (Math.sqrt(x * x + y * y + z * z) < 1500) continue; // Keep stars away from central area
    starVertices.push(x, y, z);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starVertices, 3)
  );
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.65,
  });
  starField = new THREE.Points(starGeometry, starMaterial);
  scene.add(starField);
}

function createPlanets() {
  planetsGroup = new THREE.Group();
  const planetData = [
    // Distances in sim_units, sizes in sim_units (radius)
    {
      color: 0xff8844,
      size: 10,
      distance: 2500,
      angle: Math.PI / 3,
      speed: 0.00002,
    }, // Mars-like
    {
      color: 0xaaaaff,
      size: 12,
      distance: 3500,
      angle: (Math.PI * 2) / 3,
      speed: 0.000015,
    }, // Venus-like
    {
      color: 0xffcc66,
      size: 20,
      distance: 4500,
      angle: (Math.PI * 4) / 3,
      speed: 0.00001,
    }, // Jupiter-like (smaller for background)
  ];
  planetData.forEach((data) => {
    const planetGeometry = new THREE.SphereGeometry(data.size, 24, 24); // Reduced segments for performance
    const planetMaterial = new THREE.MeshStandardMaterial({
      color: data.color,
      emissive: data.color,
      emissiveIntensity: 0.2,
      roughness: 0.9,
      metalness: 0.1,
    });
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planet.position.x = data.distance * Math.cos(data.angle);
    planet.position.z = data.distance * Math.sin(data.angle);
    planet.position.y = THREE.MathUtils.randFloatSpread(data.distance * 0.1); // Slight y variation
    planet.userData = { ...data };
    planetsGroup.add(planet);
  });
  scene.add(planetsGroup);
}

function createSpacecraft() {
  spacecraft = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xdee2e6,
    metalness: 0.9,
    roughness: 0.3,
    name: "SC_Body",
  });
  const noseConeMaterial = new THREE.MeshStandardMaterial({
    color: 0xfca311,
    metalness: 0.7,
    roughness: 0.4,
    name: "SC_Nose",
  }); // Orange nose
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0xcdd1d4,
    metalness: 0.8,
    roughness: 0.35,
    name: "SC_Wing",
  });
  const engineHousingMaterial = new THREE.MeshStandardMaterial({
    color: 0xadb5bd,
    metalness: 0.9,
    roughness: 0.2,
    name: "SC_EngineHousing",
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x0077cc,
    emissive: 0x003366,
    metalness: 0.2,
    roughness: 0.1,
    transparent: true,
    opacity: 0.7,
    name: "SC_Window",
  });
  const antennaMaterial = new THREE.MeshStandardMaterial({
    color: 0xced4da,
    metalness: 0.9,
    roughness: 0.4,
    name: "SC_Antenna",
  });
  const engineGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc300,
    transparent: true,
    opacity: 0.85,
    name: "SC_EngineGlow",
  });

  // Target a visual length for the spacecraft's body of about 1.5 simulation units
  const originalBodyLength = 4.5; // From original CylinderGeometry for body
  const scScale = TARGET_BODY_LENGTH_SIM_UNITS / originalBodyLength; // Calculate scale factor using global constant

  // Main Body
  const bodyGeometry = new THREE.CylinderGeometry(
    1 * scScale,
    1.1 * scScale,
    originalBodyLength * scScale,
    24
  );
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  spacecraft.add(body);

  // Nose Cone
  const noseConeGeometry = new THREE.ConeGeometry(
    1 * scScale,
    2.2 * scScale,
    24
  );
  const noseCone = new THREE.Mesh(noseConeGeometry, noseConeMaterial);
  noseCone.position.z = -(originalBodyLength / 2 + 2.2 / 2) * scScale;
  noseCone.rotation.x = Math.PI / 2;
  noseCone.castShadow = true;
  spacecraft.add(noseCone);

  // Cockpit Window
  const windowRadius = 0.85 * scScale;
  const windowGeometry = new THREE.SphereGeometry(
    windowRadius,
    24,
    12,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2.8
  );
  const cockpitWindow = new THREE.Mesh(windowGeometry, windowMaterial);
  cockpitWindow.position.z = -(originalBodyLength / 2 - 1.1) * scScale; // Adjust based on new body center
  cockpitWindow.position.y = 0.35 * scScale;
  cockpitWindow.rotation.x = -Math.PI / 12;
  cockpitWindow.castShadow = true;
  spacecraft.add(cockpitWindow);

  // Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.4 * scScale, 0.1 * scScale);
  wingShape.lineTo(2.5 * scScale, 0);
  wingShape.lineTo(2.3 * scScale, -0.3 * scScale);
  wingShape.lineTo(0, -0.2 * scScale);
  wingShape.closePath();
  const wingExtrudeSettings = {
    depth: 0.15 * scScale,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.02 * scScale,
    bevelThickness: 0.02 * scScale,
  };
  const wingGeometry = new THREE.ExtrudeGeometry(
    wingShape,
    wingExtrudeSettings
  );
  const wingLeft = new THREE.Mesh(wingGeometry, wingMaterial);
  wingLeft.position.set(-0.8 * scScale, 0.1 * scScale, 0);
  wingLeft.rotation.set(Math.PI, -Math.PI / 6, Math.PI / 2);
  wingLeft.castShadow = true;
  wingLeft.receiveShadow = true;
  spacecraft.add(wingLeft);
  const wingRight = new THREE.Mesh(wingGeometry, wingMaterial);
  wingRight.position.set(0.8 * scScale, 0.1 * scScale, 0);
  wingRight.rotation.set(Math.PI, Math.PI / 6, -Math.PI / 2);
  wingRight.castShadow = true;
  wingRight.receiveShadow = true;
  spacecraft.add(wingRight);

  // Tail Fin
  const tailFinShape = new THREE.Shape();
  tailFinShape.moveTo(0, 0);
  tailFinShape.lineTo(0.8 * scScale, 0.1 * scScale);
  tailFinShape.lineTo(0.7 * scScale, -1.2 * scScale);
  tailFinShape.lineTo(-0.1 * scScale, -1.0 * scScale);
  tailFinShape.closePath();
  const tailFinExtrudeSettings = { depth: 0.1 * scScale, bevelEnabled: false };
  const tailFinGeometry = new THREE.ExtrudeGeometry(
    tailFinShape,
    tailFinExtrudeSettings
  );
  const tailFin = new THREE.Mesh(tailFinGeometry, wingMaterial);
  tailFin.position.set(
    0,
    (0.15 / 2 + 1.2 / 2) * scScale,
    (originalBodyLength / 2 - 0.5) * scScale
  );
  tailFin.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI / 15);
  tailFin.castShadow = true;
  tailFin.receiveShadow = true;
  spacecraft.add(tailFin);

  // Engine Housing
  const engineHousingGeometry = new THREE.CylinderGeometry(
    0.75 * scScale,
    0.6 * scScale,
    1.2 * scScale,
    24
  );
  const engineHousing = new THREE.Mesh(
    engineHousingGeometry,
    engineHousingMaterial
  );
  engineHousing.position.z = (originalBodyLength / 2 + 1.2 / 2) * scScale;
  engineHousing.rotation.x = Math.PI / 2;
  engineHousing.castShadow = true;
  spacecraft.add(engineHousing);

  // Engine Glow
  const engineGlowGeometry = new THREE.CylinderGeometry(
    0.55 * scScale,
    0.35 * scScale,
    0.5 * scScale,
    24
  );
  engineGlow = new THREE.Mesh(engineGlowGeometry, engineGlowMaterial);
  engineGlow.position.z =
    (originalBodyLength / 2 + 1.2 + 0.5 / 2 - 0.1) * scScale;
  engineGlow.rotation.x = Math.PI / 2;
  spacecraft.add(engineGlow);

  // Antennae
  const antennaLength = 0.8 * scScale;
  const antennaRadius = 0.03 * scScale;
  const antennaGeometry = new THREE.CylinderGeometry(
    antennaRadius,
    antennaRadius,
    antennaLength,
    8
  );
  const antenna1 = new THREE.Mesh(antennaGeometry, antennaMaterial);
  antenna1.position.set(
    0.3 * scScale,
    (1.1 / 2 + antennaLength / 2) * scScale,
    -0.5 * scScale
  );
  antenna1.rotation.z = Math.PI / 8;
  antenna1.castShadow = true;
  spacecraft.add(antenna1);
  const antenna2 = new THREE.Mesh(antennaGeometry, antennaMaterial);
  antenna2.position.set(
    -0.3 * scScale,
    (1.1 / 2 + antennaLength / 2) * scScale,
    -0.5 * scScale
  );
  antenna2.rotation.z = -Math.PI / 8;
  antenna2.castShadow = true;
  spacecraft.add(antenna2);

  spacecraft.position.copy(spacecraftPosition_SIM);
  scene.add(spacecraft);
}

function createOrbitTrail() {
  orbitTrailPoints = [];
  const trailGeometry = new THREE.BufferGeometry();
  const trailMaterial = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.5,
  });
  orbitTrail = new THREE.Line(trailGeometry, trailMaterial);
  scene.add(orbitTrail);
}

function updateOrbitTrail() {
  if (!orbitTrail || !spacecraft) return;

  orbitTrailPoints.push(spacecraft.position.clone());
  if (orbitTrailPoints.length > 1000) {
    // Limit trail length
    orbitTrailPoints.shift();
  }

  orbitTrail.geometry.setFromPoints(orbitTrailPoints);
  orbitTrail.geometry.attributes.position.needsUpdate = true;
}

function handleCollision() {
  // Reset velocity
  spacecraftVelocity_SIM.set(0, 0, 0);

  // Move spacecraft to safe distance
  const safeDistance = centralBody.geometry.parameters.radius * 1.2;
  spacecraft.position.normalize().multiplyScalar(safeDistance);

  // Create explosion effect
  createExplosionEffect(spacecraft.position.clone());
}

function createExplosionEffect(position) {
  const particleCount = 50;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    positions[i3] = position.x;
    positions[i3 + 1] = position.y;
    positions[i3 + 2] = position.z;

    colors[i3] = 1; // R
    colors[i3 + 1] = 0.5; // G
    colors[i3 + 2] = 0; // B
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    transparent: true,
    opacity: 1,
  });

  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  // Animate particles
  const velocities = positions.map(() => (Math.random() - 0.5) * 2);

  function animateParticles() {
    const positions = particles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += velocities[i] * 0.1;
      positions[i + 1] += velocities[i + 1] * 0.1;
      positions[i + 2] += velocities[i + 2] * 0.1;
    }
    particles.geometry.attributes.position.needsUpdate = true;
    material.opacity -= 0.02;

    if (material.opacity > 0) {
      requestAnimationFrame(animateParticles);
    } else {
      scene.remove(particles);
    }
  }

  animateParticles();
}

function onWindowResize() {
  const canvasWidth = window.innerWidth - 320;
  const canvasHeight = window.innerHeight;

  camera.aspect = canvasWidth / canvasHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(canvasWidth, canvasHeight);
}

function animate() {
  requestAnimationFrame(animate);
  if (isPaused) return;

  const deltaTime = Math.min(clock.getDelta(), 0.1) * timeScale;
  const elapsedTime = clock.getElapsedTime();

  if (spacecraft && centralBody) {
    // Store initial state
    const initialVelocity = spacecraftVelocity_SIM.clone();
    const initialPosition = spacecraft.position.clone();

    // Update physics
    const directionToCentralBody = new THREE.Vector3().subVectors(
      centralBody.position,
      spacecraft.position
    );
    const distanceSq_SIM = directionToCentralBody.lengthSq();
    const distance_SIM = Math.sqrt(distanceSq_SIM);

    const centralBodyRadius = centralBody.geometry.parameters.radius;
    const spacecraftEffectiveRadius = TARGET_BODY_LENGTH_SIM_UNITS * 0.5;

    if (distance_SIM < centralBodyRadius + spacecraftEffectiveRadius * 0.5) {
      handleCollision();
    } else {
      const forceMagnitude_SIM =
        (G_SIM * centralBodyMass_SIM * spacecraftMass_SIM) / distanceSq_SIM;
      const forceVector_SIM = directionToCentralBody
        .normalize()
        .multiplyScalar(forceMagnitude_SIM);
      const acceleration_SIM = forceVector_SIM.divideScalar(spacecraftMass_SIM);
      spacecraftVelocity_SIM.add(acceleration_SIM.multiplyScalar(deltaTime));
      spacecraft.position.add(
        spacecraftVelocity_SIM.clone().multiplyScalar(deltaTime)
      );

      // Update spacecraft orientation
      if (spacecraftVelocity_SIM.lengthSq() > 0.00001) {
        const targetQuaternion = new THREE.Quaternion();
        const velocityDirection = spacecraftVelocity_SIM.clone().normalize();
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.lookAt(
          new THREE.Vector3(0, 0, 0),
          velocityDirection,
          new THREE.Vector3(0, 1, 0)
        );
        targetQuaternion.setFromRotationMatrix(rotationMatrix);
        spacecraft.quaternion.slerp(
          targetQuaternion,
          SPACECRAFT_ROTATION_SPEED
        );
      }

      updateOrbitTrail();
    }

    // Update camera after physics (using stored initial state if needed)
    updateFollowCamera();
    calculateOrbitalParameters();
    updateTrajectoryPrediction();

    const realDistanceKm = distance_SIM / DISTANCE_SIM_UNITS_PER_KM;
    distEarthDisplay.textContent = realDistanceKm.toFixed(0) + " km";
    const realVelocityKms =
      spacecraftVelocity_SIM.length() / VELOCITY_SIM_UNITS_PER_KMS;
    scVelDisplay.textContent = realVelocityKms.toFixed(2) + " km/s";
    const realSpacecraftMassKg = parseFloat(scMassSlider.value) * 1000;
    const realDistanceM = realDistanceKm * 1000;
    if (realDistanceM > 0) {
      const realGravForce =
        (G_REAL * EARTH_MASS_REAL * realSpacecraftMassKg) /
        (realDistanceM * realDistanceM);
      gravForceDisplay.textContent = realGravForce.toExponential(2) + " N";
    } else {
      gravForceDisplay.textContent = "N/A";
    }
  }

  if (engineGlow) {
    const pulseFactor = (Math.sin(elapsedTime * 4) + 1) / 2; // Faster pulse
    engineGlow.material.opacity = 0.7 + pulseFactor * 0.3;
    const scaleFactor = 1.0 + pulseFactor * 0.15;
    engineGlow.scale.set(scaleFactor, scaleFactor, scaleFactor);
  }
  if (starField) {
    starField.rotation.y += deltaTime * 0.002;
  } // Slower starfield rotation
  if (planetsGroup) {
    planetsGroup.children.forEach((planet) => {
      planet.userData.angle += planet.userData.speed * deltaTime * 500; // Adjusted speed factor for deltaTime
      planet.position.x =
        planet.userData.distance * Math.cos(planet.userData.angle);
      planet.position.z =
        planet.userData.distance * Math.sin(planet.userData.angle);
      planet.rotation.y += deltaTime * 0.05;
    });
  }

  controls.update();
  renderer.render(scene, camera);
}

function createTrajectoryLine() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineDashedMaterial({
    color: 0xff0000,
    dashSize: 3,
    gapSize: 1,
    transparent: true,
    opacity: 0.5,
  });
  trajectoryLine = new THREE.Line(geometry, material);
  scene.add(trajectoryLine);
}

function updateTrajectoryPrediction() {
  if (!spacecraft || !trajectoryLine) return;

  const points = [];
  const pos = spacecraft.position.clone();
  const vel = spacecraftVelocity_SIM.clone();
  const steps = 1000;
  const dt = simulationTimeStep * 2;

  for (let i = 0; i < steps; i++) {
    points.push(pos.clone());

    const dirToCentralBody = new THREE.Vector3().subVectors(
      centralBody.position,
      pos
    );
    const distSq = dirToCentralBody.lengthSq();
    const forceMag =
      (G_SIM * centralBodyMass_SIM * spacecraftMass_SIM) / distSq;
    const force = dirToCentralBody.normalize().multiplyScalar(forceMag);
    const acc = force.divideScalar(spacecraftMass_SIM);

    vel.add(acc.multiplyScalar(dt));
    pos.add(vel.clone().multiplyScalar(dt));

    // Break if trajectory intersects with central body
    if (pos.length() < centralBody.geometry.parameters.radius) break;
  }

  trajectoryLine.geometry.setFromPoints(points);
  trajectoryLine.computeLineDistances();
}

function calculateOrbitalParameters() {
  if (!spacecraft) return;

  const pos = spacecraft.position;
  const vel = spacecraftVelocity_SIM;
  const distance = pos.length();

  // Update apoapsis/periapsis
  minPeriapsis = Math.min(minPeriapsis, distance);
  maxApoapsis = Math.max(maxApoapsis, distance);

  // Calculate orbital period (approximation)
  const semiMajorAxis = (maxApoapsis + minPeriapsis) / 2;
  const period =
    2 *
    Math.PI *
    Math.sqrt(Math.pow(semiMajorAxis, 3) / (G_SIM * centralBodyMass_SIM));

  // Calculate total energy
  const kineticEnergy = 0.5 * spacecraftMass_SIM * vel.lengthSq();
  const potentialEnergy =
    (-G_SIM * centralBodyMass_SIM * spacecraftMass_SIM) / distance;
  const totalEnergy = kineticEnergy + potentialEnergy;

  // Update displays
  document.getElementById("orbitalPeriodDisplay").textContent =
    (period * simulationTimeStep).toFixed(2) + " s";
  document.getElementById("apoapsisDisplay").textContent =
    (maxApoapsis / DISTANCE_SIM_UNITS_PER_KM).toFixed(0) + " km";
  document.getElementById("periapsisDisplay").textContent =
    (minPeriapsis / DISTANCE_SIM_UNITS_PER_KM).toFixed(0) + " km";
  document.getElementById("totalEnergyDisplay").textContent =
    totalEnergy.toExponential(2) + " J";
}

function updateFollowCamera() {
  if (!isFollowingSpacecraft || !spacecraft) return;

  // Store current physics state
  const currentVelocity = spacecraftVelocity_SIM.clone();
  const currentPosition = spacecraft.position.clone();

  // Get spacecraft's orientation with smoothing
  const spacecraftForward = new THREE.Vector3(0, 0, 1).applyQuaternion(
    spacecraft.quaternion
  );
  const spacecraftUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
    spacecraft.quaternion
  );
  const spacecraftRight = new THREE.Vector3(1, 0, 0).applyQuaternion(
    spacecraft.quaternion
  );

  // Calculate velocity-based distance adjustment
  const velocityMagnitude = currentVelocity.length();
  const acceleration = new THREE.Vector3();
  if (previousVelocity) {
    acceleration
      .copy(currentVelocity)
      .sub(previousVelocity)
      .divideScalar(simulationTimeStep);
  }
  const accelerationMagnitude = acceleration.length();

  // Adjust follow distance based on velocity and acceleration
  const velocityDistance = velocityMagnitude * VELOCITY_DISTANCE_FACTOR;
  const accelerationDistance =
    accelerationMagnitude * ACCELERATION_DISTANCE_FACTOR;
  const dynamicDistance = Math.max(
    MIN_FOLLOW_DISTANCE,
    cameraOffset.z + velocityDistance + accelerationDistance
  );

  // Store velocity for next frame without affecting current physics
  if (!previousVelocity) previousVelocity = new THREE.Vector3();
  previousVelocity.copy(currentVelocity);

  // Calculate desired camera position in spacecraft's local space
  const desiredOffset = new THREE.Vector3();
  desiredOffset.copy(spacecraftRight).multiplyScalar(cameraOffset.x);
  desiredOffset.add(spacecraftUp.clone().multiplyScalar(cameraOffset.y));
  desiredOffset.add(spacecraftForward.clone().multiplyScalar(-dynamicDistance));

  // Add spacing based on direction changes
  const directionChange = spacecraftForward.angleTo(
    spacecraftVelocity_SIM.normalize()
  );
  const turnSpacing = Math.sin(directionChange) * velocityMagnitude * 2;
  desiredOffset.add(spacecraftRight.multiplyScalar(turnSpacing));

  // Calculate final camera position
  const desiredPosition = spacecraft.position.clone().add(desiredOffset);

  // Enhanced dynamic smoothing based on multiple factors
  const distanceToSpacecraft = camera.position.distanceTo(spacecraft.position);
  const angularVelocity = spacecraft.quaternion.angleTo(
    spacecraft.quaternion.clone()
  );

  // Adjust smoothing based on distance and velocities
  const distanceFactor = THREE.MathUtils.clamp(
    distanceToSpacecraft / 50,
    0.5,
    2
  );
  const velocityFactor = THREE.MathUtils.clamp(velocityMagnitude * 0.06, 0, 1);
  const angularFactor = THREE.MathUtils.clamp(angularVelocity * 1.5, 0, 1);

  const dynamicSmoothFactor = THREE.MathUtils.clamp(
    smoothFactor * (1 / (1 + velocityFactor + angularFactor)) * distanceFactor,
    0.012,
    0.1
  );

  // Enhanced velocity anticipation with spacing consideration
  const velocityInfluence = spacecraftVelocity_SIM
    .clone()
    .multiplyScalar(VELOCITY_ANTICIPATION * (1 + velocityMagnitude * 0.02));
  desiredPosition.add(velocityInfluence);

  // Add orbital anticipation with increased effect
  const orbitNormal = spacecraft.position
    .clone()
    .cross(spacecraftVelocity_SIM)
    .normalize();
  const orbitInfluence = orbitNormal.multiplyScalar(velocityMagnitude * 0.15); // Increased orbital influence
  desiredPosition.add(orbitInfluence);

  // Ensure minimum distance is maintained
  const toSpacecraft = desiredPosition.clone().sub(spacecraft.position);
  const currentDistance = toSpacecraft.length();
  if (currentDistance < MIN_FOLLOW_DISTANCE) {
    toSpacecraft.normalize().multiplyScalar(MIN_FOLLOW_DISTANCE);
    desiredPosition.copy(spacecraft.position).add(toSpacecraft);
  }

  // Smoothly move camera with adaptive interpolation
  camera.position.lerp(desiredPosition, dynamicSmoothFactor);

  // Enhanced look-at calculation with velocity lead and spacing
  const lookAtOffset = spacecraftVelocity_SIM
    .clone()
    .multiplyScalar(VELOCITY_LEAD * (1 + velocityMagnitude * 0.01));
  const targetPos = spacecraft.position.clone().add(lookAtOffset);

  // Smoother look-at transition with adaptive speed
  const currentLookAt = new THREE.Vector3();
  camera.getWorldDirection(currentLookAt);
  const desiredLookAt = targetPos.clone().sub(camera.position).normalize();
  const lookSmoothFactor = dynamicSmoothFactor * SMOOTH_LOOK_MULTIPLIER;
  const interpolatedLookAt = currentLookAt.lerp(
    desiredLookAt,
    lookSmoothFactor
  );
  const lookAtPoint = camera.position
    .clone()
    .add(interpolatedLookAt.multiplyScalar(100));
  camera.lookAt(lookAtPoint);

  // Update camera's up vector with very smooth transition
  const upSmoothFactor = dynamicSmoothFactor * UP_VECTOR_SMOOTH_MULTIPLIER;
  cameraUp.lerp(spacecraftUp, upSmoothFactor);
  camera.up.copy(cameraUp);

  // Ensure physics state remains unchanged
  spacecraftVelocity_SIM.copy(currentVelocity);
  spacecraft.position.copy(currentPosition);
}

function setupCameraControls() {
  const cameraMode = document.getElementById("cameraMode");
  const topViewBtn = document.getElementById("topViewButton");
  const sideViewBtn = document.getElementById("sideViewButton");
  const frontViewBtn = document.getElementById("frontViewButton");

  cameraMode.addEventListener("change", (e) => {
    isFollowingSpacecraft = e.target.value === "follow";
    controls.enabled = !isFollowingSpacecraft;

    if (!isFollowingSpacecraft) {
      // Reset camera up vector
      camera.up.set(0, 1, 0);
      cameraUp.set(0, 1, 0);
    } else {
      // Store current physics state
      const currentVelocity = spacecraftVelocity_SIM.clone();
      const currentPosition = spacecraft.position.clone();

      // Set initial camera position behind spacecraft without affecting physics
      if (spacecraft) {
        const velocityDirection = currentVelocity.clone().normalize();
        const rightVector = new THREE.Vector3(0, 1, 0)
          .cross(velocityDirection)
          .normalize();
        const upVector = velocityDirection
          .clone()
          .cross(rightVector)
          .normalize();

        // Create rotation matrix based on velocity direction
        const matrix = new THREE.Matrix4();
        matrix.makeBasis(rightVector, upVector, velocityDirection);

        // Calculate initial camera position
        const offset = new THREE.Vector3(0, 8, 35);
        const desiredOffset = offset.clone().applyMatrix4(matrix);
        const targetPosition = currentPosition.clone().add(desiredOffset);

        // Smoothly move camera to position
        camera.position.lerp(targetPosition, 0.3);
        camera.lookAt(currentPosition);

        // Reset camera up vector for initial transition
        camera.up.set(0, 1, 0);
        cameraUp.copy(camera.up);
      }

      // Ensure physics state remains unchanged
      spacecraftVelocity_SIM.copy(currentVelocity);
      spacecraft.position.copy(currentPosition);
    }
  });

  topViewBtn.addEventListener("click", () => {
    camera.position.set(0, 150, 0);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    cameraMode.value = "free";
    isFollowingSpacecraft = false;
    controls.enabled = true;
  });

  sideViewBtn.addEventListener("click", () => {
    camera.position.set(150, 0, 0);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    cameraMode.value = "free";
    isFollowingSpacecraft = false;
    controls.enabled = true;
  });

  frontViewBtn.addEventListener("click", () => {
    camera.position.set(0, 0, 150);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    cameraMode.value = "free";
    isFollowingSpacecraft = false;
    controls.enabled = true;
  });
}

// Update camera controls
document.addEventListener("keydown", (event) => {
  if (!isFollowingSpacecraft) return;

  let offsetDelta = event.shiftKey ? 4 : 1.5; // Finer default control, faster with shift

  switch (event.key) {
    case "ArrowUp":
      cameraOffset.y = Math.min(
        cameraOffset.y + offsetDelta,
        CAMERA_OFFSET_MAX / 2
      );
      break;
    case "ArrowDown":
      cameraOffset.y = Math.max(
        cameraOffset.y - offsetDelta,
        -CAMERA_OFFSET_MAX / 2
      );
      break;
    case "ArrowLeft":
      cameraOffset.x = Math.max(
        cameraOffset.x - offsetDelta,
        -CAMERA_OFFSET_MAX / 2
      );
      break;
    case "ArrowRight":
      cameraOffset.x = Math.min(
        cameraOffset.x + offsetDelta,
        CAMERA_OFFSET_MAX / 2
      );
      break;
    case "+":
    case "=":
      cameraOffset.z = Math.max(
        cameraOffset.z - offsetDelta * 2,
        CAMERA_OFFSET_MIN
      );
      break;
    case "-":
    case "_":
      cameraOffset.z = Math.min(
        cameraOffset.z + offsetDelta * 2,
        CAMERA_OFFSET_MAX
      );
      break;
    case "q": // Rotate view left around spacecraft
      {
        const currentAngle = Math.atan2(cameraOffset.x, -cameraOffset.z);
        const newAngle =
          currentAngle + (event.shiftKey ? ROTATION_SPEED * 2 : ROTATION_SPEED);
        const radius = Math.sqrt(
          cameraOffset.x * cameraOffset.x + cameraOffset.z * cameraOffset.z
        );
        cameraOffset.x = radius * Math.sin(newAngle);
        cameraOffset.z = -radius * Math.cos(newAngle);
      }
      break;
    case "e": // Rotate view right around spacecraft
      {
        const currentAngle = Math.atan2(cameraOffset.x, -cameraOffset.z);
        const newAngle =
          currentAngle - (event.shiftKey ? ROTATION_SPEED * 2 : ROTATION_SPEED);
        const radius = Math.sqrt(
          cameraOffset.x * cameraOffset.x + cameraOffset.z * cameraOffset.z
        );
        cameraOffset.x = radius * Math.sin(newAngle);
        cameraOffset.z = -radius * Math.cos(newAngle);
      }
      break;
    case "c": // Toggle between close and far view
      if (cameraOffset.z > 40) {
        cameraOffset.set(0, 6, 25); // Close view
      } else if (cameraOffset.z > 25) {
        cameraOffset.set(0, 10, 50); // Medium view
      } else {
        cameraOffset.set(0, 15, 90); // Far view
      }
      break;
    case "r": // Reset camera offset to default
      cameraOffset.set(0, 8, 35);
      break;
    case "v": // Toggle vertical offset
      if (cameraOffset.y > 5) {
        cameraOffset.y = 0; // Level view
      } else {
        cameraOffset.y = 10; // High view
      }
      break;
  }
});

// Add variable to store previous velocity for acceleration calculation
let previousVelocity = null;

init();
