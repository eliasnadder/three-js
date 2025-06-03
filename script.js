// Global variables
let scene, camera, renderer, spacecraft, controls, engineGlow, starField, planetsGroup, centralBody;
const clock = new THREE.Clock();

const G_SIM = 20; 
let centralBodyMass_SIM = 20000; 
let spacecraftMass_SIM = 1;
let spacecraftVelocity_SIM = new THREE.Vector3();
let spacecraftPosition_SIM = new THREE.Vector3();
let simulationTimeStep = 0.016; 

const G_REAL = 6.67430e-11;
const EARTH_MASS_REAL = 5.972e24;
const EARTH_RADIUS_KM = 6371;
const TARGET_BODY_LENGTH_SIM_UNITS = 1.5; // Moved from createSpacecraft to global scope

const DISTANCE_SIM_UNITS_PER_KM = 1 / 75; 
const VELOCITY_SIM_UNITS_PER_KMS = 8.5; 

let scMassSlider, orbDistSlider, initVelSlider;
let scMassValue, orbDistValue, initVelValue;
let gravForceDisplay, scVelDisplay, distEarthDisplay, earthMassDisplay;
let resetButton;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);

    camera = new THREE.PerspectiveCamera(75, (window.innerWidth - 320) / window.innerHeight, 0.1, 10000); // Increased far plane for distant stars/planets
    camera.position.set(70, 42, 70); // Initial camera position (sim units)

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth - 320, window.innerHeight);
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

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false; 
    controls.minDistance = centralBody.geometry.parameters.radius * 1.1; // Prevent clipping into Earth
    controls.maxDistance = 6000; // Allow zooming out to see distant planets
    controls.target.set(0, 0, 0);

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function setupUIControls() {
    scMassSlider = document.getElementById('scMassSlider');
    orbDistSlider = document.getElementById('orbDistSlider');
    initVelSlider = document.getElementById('initVelSlider');
    scMassValue = document.getElementById('scMassValue');
    orbDistValue = document.getElementById('orbDistValue');
    initVelValue = document.getElementById('initVelValue');
    resetButton = document.getElementById('resetButton');

    gravForceDisplay = document.getElementById('gravForceDisplay');
    scVelDisplay = document.getElementById('scVelDisplay');
    distEarthDisplay = document.getElementById('distEarthDisplay');
    earthMassDisplay = document.getElementById('earthMassDisplay');

    earthMassDisplay.textContent = EARTH_MASS_REAL.toExponential(2) + " kg";

    function updateSliderDisplay(slider, display, unit, decimals = 1) {
        display.textContent = parseFloat(slider.value).toFixed(decimals) + unit;
    }

    scMassSlider.addEventListener('input', () => updateSliderDisplay(scMassSlider, scMassValue, " tons"));
    orbDistSlider.addEventListener('input', () => updateSliderDisplay(orbDistSlider, orbDistValue, " km", 0));
    initVelSlider.addEventListener('input', () => updateSliderDisplay(initVelSlider, initVelValue, " km/s", 2));
    
    updateSliderDisplay(scMassSlider, scMassValue, " tons");
    updateSliderDisplay(orbDistSlider, orbDistValue, " km", 0);
    updateSliderDisplay(initVelSlider, initVelValue, " km/s", 2);

    resetButton.addEventListener('click', resetSimulation);
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
    clock.elapsedTime = 0; 
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
        if (Math.sqrt(x*x + y*y + z*z) < 1500) continue; // Keep stars away from central area
        starVertices.push(x, y, z);
    }
    const starGeometry = new THREE.BufferGeometry(); 
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: true, transparent: true, opacity: 0.65 });
    starField = new THREE.Points(starGeometry, starMaterial); 
    scene.add(starField);
}

function createPlanets() { 
    planetsGroup = new THREE.Group();
    const planetData = [ // Distances in sim_units, sizes in sim_units (radius)
        { color: 0xff8844, size: 10, distance: 2500, angle: Math.PI / 3, speed: 0.00002 }, // Mars-like
        { color: 0xaaaaff, size: 12, distance: 3500, angle: Math.PI * 2 / 3, speed: 0.000015 }, // Venus-like
        { color: 0xffcc66, size: 20, distance: 4500, angle: Math.PI * 4 / 3, speed: 0.00001 }  // Jupiter-like (smaller for background)
    ];
    planetData.forEach(data => {
        const planetGeometry = new THREE.SphereGeometry(data.size, 24, 24); // Reduced segments for performance
        const planetMaterial = new THREE.MeshStandardMaterial({ 
            color: data.color,
            emissive: data.color, 
            emissiveIntensity: 0.2,
            roughness: 0.9,
            metalness: 0.1
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
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xdee2e6, metalness: 0.9, roughness: 0.3, name: "SC_Body" });
    const noseConeMaterial = new THREE.MeshStandardMaterial({ color: 0xfca311, metalness: 0.7, roughness: 0.4, name: "SC_Nose" }); // Orange nose
    const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xcdd1d4, metalness: 0.8, roughness: 0.35, name: "SC_Wing" });
    const engineHousingMaterial = new THREE.MeshStandardMaterial({ color: 0xadb5bd, metalness: 0.9, roughness: 0.2, name: "SC_EngineHousing" });
    const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x0077cc, emissive: 0x003366, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.7, name: "SC_Window" });
    const antennaMaterial = new THREE.MeshStandardMaterial({ color: 0xced4da, metalness: 0.9, roughness: 0.4, name: "SC_Antenna" });
    const engineGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc300, transparent: true, opacity: 0.85, name: "SC_EngineGlow" });

    // Target a visual length for the spacecraft's body of about 1.5 simulation units
    const originalBodyLength = 4.5; // From original CylinderGeometry for body
    const scScale = TARGET_BODY_LENGTH_SIM_UNITS / originalBodyLength; // Calculate scale factor using global constant

    // Main Body
    const bodyGeometry = new THREE.CylinderGeometry(1*scScale, 1.1*scScale, originalBodyLength*scScale, 24);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial); body.rotation.x = Math.PI / 2; body.castShadow = true; body.receiveShadow = true; spacecraft.add(body);
    
    // Nose Cone
    const noseConeGeometry = new THREE.ConeGeometry(1*scScale, 2.2*scScale, 24);
    const noseCone = new THREE.Mesh(noseConeGeometry, noseConeMaterial); noseCone.position.z = -(originalBodyLength/2 + 2.2/2)*scScale; noseCone.rotation.x = Math.PI / 2; noseCone.castShadow = true; spacecraft.add(noseCone);
    
    // Cockpit Window
    const windowRadius = 0.85*scScale;
    const windowGeometry = new THREE.SphereGeometry(windowRadius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.8);
    const cockpitWindow = new THREE.Mesh(windowGeometry, windowMaterial); 
    cockpitWindow.position.z = -(originalBodyLength/2 - 1.1)*scScale; // Adjust based on new body center
    cockpitWindow.position.y = 0.35*scScale; 
    cockpitWindow.rotation.x = -Math.PI / 12; 
    cockpitWindow.castShadow = true; spacecraft.add(cockpitWindow);

    // Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.lineTo(0.4*scScale, 0.1*scScale); wingShape.lineTo(2.5*scScale, 0);
    wingShape.lineTo(2.3*scScale, -0.3*scScale); wingShape.lineTo(0, -0.2*scScale); wingShape.closePath();
    const wingExtrudeSettings = { depth: 0.15*scScale, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.02*scScale, bevelThickness: 0.02*scScale };
    const wingGeometry = new THREE.ExtrudeGeometry(wingShape, wingExtrudeSettings);
    const wingLeft = new THREE.Mesh(wingGeometry, wingMaterial); wingLeft.position.set(-0.8*scScale, 0.1*scScale, 0); wingLeft.rotation.set(Math.PI, -Math.PI / 6, Math.PI / 2) ; wingLeft.castShadow = true; wingLeft.receiveShadow = true; spacecraft.add(wingLeft);
    const wingRight = new THREE.Mesh(wingGeometry, wingMaterial); wingRight.position.set(0.8*scScale, 0.1*scScale, 0); wingRight.rotation.set(Math.PI, Math.PI / 6, -Math.PI / 2); wingRight.castShadow = true; wingRight.receiveShadow = true; spacecraft.add(wingRight);

    // Tail Fin
    const tailFinShape = new THREE.Shape();
    tailFinShape.moveTo(0,0); tailFinShape.lineTo(0.8*scScale, 0.1*scScale); tailFinShape.lineTo(0.7*scScale, -1.2*scScale);
    tailFinShape.lineTo(-0.1*scScale, -1.0*scScale); tailFinShape.closePath();
    const tailFinExtrudeSettings = {depth: 0.1*scScale, bevelEnabled: false};
    const tailFinGeometry = new THREE.ExtrudeGeometry(tailFinShape, tailFinExtrudeSettings);
    const tailFin = new THREE.Mesh(tailFinGeometry, wingMaterial); tailFin.position.set(0, (0.15/2 + 1.2/2)*scScale, (originalBodyLength/2 - 0.5)*scScale); tailFin.rotation.set(0, Math.PI/2, Math.PI/2 + Math.PI/15); tailFin.castShadow = true; tailFin.receiveShadow = true; spacecraft.add(tailFin);
    
    // Engine Housing
    const engineHousingGeometry = new THREE.CylinderGeometry(0.75*scScale, 0.6*scScale, 1.2*scScale, 24);
    const engineHousing = new THREE.Mesh(engineHousingGeometry, engineHousingMaterial); engineHousing.position.z = (originalBodyLength/2 + 1.2/2)*scScale; engineHousing.rotation.x = Math.PI / 2; engineHousing.castShadow = true; spacecraft.add(engineHousing);
    
    // Engine Glow
    const engineGlowGeometry = new THREE.CylinderGeometry(0.55*scScale, 0.35*scScale, 0.5*scScale, 24);
    engineGlow = new THREE.Mesh(engineGlowGeometry, engineGlowMaterial); engineGlow.position.z = (originalBodyLength/2 + 1.2 + 0.5/2 - 0.1)*scScale; engineGlow.rotation.x = Math.PI / 2; spacecraft.add(engineGlow);
    
    // Antennae
    const antennaLength = 0.8*scScale;
    const antennaRadius = 0.03*scScale;
    const antennaGeometry = new THREE.CylinderGeometry(antennaRadius, antennaRadius, antennaLength, 8);
    const antenna1 = new THREE.Mesh(antennaGeometry, antennaMaterial); antenna1.position.set(0.3*scScale, (1.1/2 + antennaLength/2)*scScale, -0.5*scScale); antenna1.rotation.z = Math.PI / 8; antenna1.castShadow = true; spacecraft.add(antenna1);
    const antenna2 = new THREE.Mesh(antennaGeometry, antennaMaterial); antenna2.position.set(-0.3*scScale, (1.1/2 + antennaLength/2)*scScale, -0.5*scScale); antenna2.rotation.z = -Math.PI / 8; antenna2.castShadow = true; spacecraft.add(antenna2);
    
    spacecraft.position.copy(spacecraftPosition_SIM);
    scene.add(spacecraft);
}

function onWindowResize() {
    camera.aspect = (window.innerWidth - 320) / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth - 320, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = Math.min(clock.getDelta(), 0.1); 
    const elapsedTime = clock.getElapsedTime();

    if (spacecraft && centralBody) {
        const directionToCentralBody = new THREE.Vector3().subVectors(centralBody.position, spacecraft.position);
        const distanceSq_SIM = directionToCentralBody.lengthSq();
        const distance_SIM = Math.sqrt(distanceSq_SIM);

        const centralBodyRadius = centralBody.geometry.parameters.radius;
        const spacecraftEffectiveRadius = TARGET_BODY_LENGTH_SIM_UNITS * 0.5; // Using global constant

        if (distance_SIM < centralBodyRadius + spacecraftEffectiveRadius * 0.5 ) { // Adjusted collision threshold
             // Stop simulation or bounce (currently does nothing to stop)
            // console.log("Collision detected!");
        } else {
            const forceMagnitude_SIM = (G_SIM * centralBodyMass_SIM * spacecraftMass_SIM) / distanceSq_SIM;
            const forceVector_SIM = directionToCentralBody.normalize().multiplyScalar(forceMagnitude_SIM);
            const acceleration_SIM = forceVector_SIM.divideScalar(spacecraftMass_SIM);
            spacecraftVelocity_SIM.add(acceleration_SIM.multiplyScalar(simulationTimeStep));
            spacecraft.position.add(spacecraftVelocity_SIM.clone().multiplyScalar(simulationTimeStep));
        }
        if (spacecraftVelocity_SIM.lengthSq() > 0.00001) { // Increased threshold slightly
            const lookAtPosition = new THREE.Vector3().copy(spacecraft.position).add(spacecraftVelocity_SIM);
            spacecraft.lookAt(lookAtPosition);
        }

        const realDistanceKm = distance_SIM / DISTANCE_SIM_UNITS_PER_KM;
        distEarthDisplay.textContent = realDistanceKm.toFixed(0) + " km";
        const realVelocityKms = spacecraftVelocity_SIM.length() / VELOCITY_SIM_UNITS_PER_KMS;
        scVelDisplay.textContent = realVelocityKms.toFixed(2) + " km/s";
        const realSpacecraftMassKg = parseFloat(scMassSlider.value) * 1000;
        const realDistanceM = realDistanceKm * 1000;
        if (realDistanceM > 0) {
            const realGravForce = (G_REAL * EARTH_MASS_REAL * realSpacecraftMassKg) / (realDistanceM * realDistanceM);
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
    if (starField) { starField.rotation.y += deltaTime * 0.002; } // Slower starfield rotation
    if (planetsGroup) {
        planetsGroup.children.forEach(planet => {
            planet.userData.angle += planet.userData.speed * deltaTime * 500; // Adjusted speed factor for deltaTime
            planet.position.x = planet.userData.distance * Math.cos(planet.userData.angle);
            planet.position.z = planet.userData.distance * Math.sin(planet.userData.angle);
            planet.rotation.y += deltaTime * 0.05;
        });
    }

    controls.update(); 
    renderer.render(scene, camera);
}
init();