"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Object3D, Quaternion } from "three";
import type { VRM } from "@pixiv/three-vrm";
import styles from "./local-avatar-stage.module.css";

export type LocalAvatarMotion = "idle" | "listening" | "thinking" | "speaking";

export type AvatarAudioSignals = {
  open: number;
  wide: number;
  round: number;
};

type ThreeModule = typeof import("three");

type ProceduralRig = {
  root: Object3D;
  head: Object3D;
  mouth: Object3D;
  leftEye: Object3D;
  rightEye: Object3D;
  leftShoulder: Object3D;
  rightShoulder: Object3D;
  leftForearm: Object3D;
  rightForearm: Object3D;
};

type VrmBone = { node: Object3D; base: Quaternion };

function buildProceduralTeacher(THREE: ThreeModule): ProceduralRig {
  const root = new THREE.Group();
  root.name = "builtin-local-teacher";

  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8b2, roughness: 0.72, metalness: 0.02 });
  const skinShade = new THREE.MeshStandardMaterial({ color: 0xdcae98, roughness: 0.78 });
  const blazer = new THREE.MeshStandardMaterial({ color: 0x155f91, roughness: 0.42, metalness: 0.08 });
  const blazerDark = new THREE.MeshStandardMaterial({ color: 0x0a385a, roughness: 0.5, metalness: 0.06 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.66 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x102c42, roughness: 0.58 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x201a1d, roughness: 0.8 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x19384b, roughness: 0.35 });
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x8c3547, roughness: 0.58 });

  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.47, 0.42, 28), blazerDark);
  pelvis.position.y = 0.76;
  pelvis.castShadow = true;
  root.add(pelvis);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.58, 0.94, 32), blazer);
  torso.position.y = 1.34;
  torso.scale.z = 0.72;
  torso.castShadow = true;
  root.add(torso);

  const shirtFront = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.67, 0.035), shirt);
  shirtFront.position.set(0, 1.42, 0.39);
  shirtFront.rotation.x = -0.035;
  root.add(shirtFront);

  const collarLeft = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.44, 3), blazerDark);
  collarLeft.position.set(-0.18, 1.55, 0.425);
  collarLeft.rotation.z = -0.12;
  root.add(collarLeft);
  const collarRight = collarLeft.clone();
  collarRight.position.x = 0.18;
  collarRight.rotation.z = 0.12;
  root.add(collarRight);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.3, 24), skinShade);
  neck.position.y = 1.95;
  neck.castShadow = true;
  root.add(neck);

  const head = new THREE.Group();
  head.position.y = 2.37;
  root.add(head);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.43, 36, 28), skin);
  face.scale.set(0.94, 1.13, 0.9);
  face.castShadow = true;
  head.add(face);

  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.455, 34, 24), hair);
  hairBack.position.set(0, 0.055, -0.105);
  hairBack.scale.set(1.02, 1.19, 0.96);
  head.add(hairBack);

  const faceMask = new THREE.Mesh(new THREE.SphereGeometry(0.425, 36, 28), skin);
  faceMask.position.z = 0.018;
  faceMask.scale.set(0.93, 1.08, 0.86);
  head.add(faceMask);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.468, 34, 22, 0, Math.PI * 2, 0, Math.PI * 0.53),
    hair,
  );
  hairCap.position.y = 0.06;
  hairCap.scale.set(1.02, 1.06, 0.96);
  head.add(hairCap);

  const sideHairGeometry = new THREE.CapsuleGeometry(0.105, 0.47, 8, 16);
  const sideHairLeft = new THREE.Mesh(sideHairGeometry, hair);
  sideHairLeft.position.set(-0.39, -0.23, -0.02);
  sideHairLeft.rotation.z = 0.04;
  head.add(sideHairLeft);
  const sideHairRight = sideHairLeft.clone();
  sideHairRight.position.x = 0.39;
  sideHairRight.rotation.z = -0.04;
  head.add(sideHairRight);

  function makeEye(x: number) {
    const group = new THREE.Group();
    group.position.set(x, 0.075, 0.37);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.076, 20, 14), eyeWhite);
    sclera.scale.set(1.18, 0.72, 0.45);
    group.add(sclera);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.034, 18, 12), iris);
    pupil.position.z = 0.045;
    pupil.scale.z = 0.45;
    group.add(pupil);
    return group;
  }

  const leftEye = makeEye(-0.145);
  const rightEye = makeEye(0.145);
  head.add(leftEye, rightEye);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 18), skinShade);
  nose.position.set(0, -0.04, 0.414);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 12), mouthMaterial);
  mouth.position.set(0, -0.215, 0.398);
  mouth.scale.set(1.12, 0.24, 0.32);
  head.add(mouth);

  function makeArm(side: -1 | 1) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.54, 1.7, 0.02);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.105, 0.6, 24), blazer);
    sleeve.position.y = -0.29;
    sleeve.castShadow = true;
    shoulder.add(sleeve);

    const forearm = new THREE.Group();
    forearm.position.y = -0.58;
    const lowerSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.085, 0.5, 22), blazerDark);
    lowerSleeve.position.y = -0.24;
    lowerSleeve.castShadow = true;
    forearm.add(lowerSleeve);
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.11, 6, 14), skin);
    hand.position.y = -0.55;
    hand.castShadow = true;
    forearm.add(hand);
    shoulder.add(forearm);
    root.add(shoulder);
    return { shoulder, forearm };
  }

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  function makeLeg(x: number) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 1.0, 24), trousers);
    leg.position.set(x, 0.16, 0);
    leg.castShadow = true;
    root.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 14), blazerDark);
    shoe.position.set(x, -0.37, 0.09);
    shoe.scale.set(1.0, 0.46, 1.4);
    shoe.castShadow = true;
    root.add(shoe);
  }
  makeLeg(-0.22);
  makeLeg(0.22);

  const badge = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 24),
    new THREE.MeshStandardMaterial({ color: 0x5de7f4, emissive: 0x153d55, emissiveIntensity: 0.7 }),
  );
  badge.position.set(0.31, 1.62, 0.45);
  root.add(badge);

  return {
    root,
    head,
    mouth,
    leftEye,
    rightEye,
    leftShoulder: leftArm.shoulder,
    rightShoulder: rightArm.shoulder,
    leftForearm: leftArm.forearm,
    rightForearm: rightArm.forearm,
  };
}

function blinkAmount(time: number) {
  const cycle = time % 4.7;
  if (cycle > 0.18) return 0;
  return Math.sin((cycle / 0.18) * Math.PI);
}

export default function LocalAvatarStage({
  motion,
  audioSignals,
  modelUrl = "",
}: {
  motion: LocalAvatarMotion;
  audioSignals: RefObject<AvatarAudioSignals>;
  modelUrl?: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const motionRef = useRef<LocalAvatarMotion>(motion);
  const [modelStatus, setModelStatus] = useState<"builtin" | "vrm" | "fallback">("builtin");

  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupScene: (() => void) | null = null;

    void (async () => {
      const THREE = await import("three");
      if (cancelled) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch {
        if (!cancelled) setModelStatus("fallback");
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = styles.canvas;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
      camera.position.set(0, 1.25, 6.15);
      camera.lookAt(0, 1.2, 0);

      const hemisphere = new THREE.HemisphereLight(0xd8f6ff, 0x07111a, 2.2);
      scene.add(hemisphere);
      const key = new THREE.DirectionalLight(0xeafaff, 3.6);
      key.position.set(2.5, 4.5, 4.2);
      key.castShadow = true;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x5fcfe9, 3.1);
      rim.position.set(-3.5, 2.8, -2.4);
      scene.add(rim);
      const warm = new THREE.PointLight(0xffc9a9, 1.4, 8);
      warm.position.set(2.3, 2.2, 2.8);
      scene.add(warm);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(1.65, 64),
        new THREE.MeshStandardMaterial({ color: 0x0b3950, roughness: 0.5, metalness: 0.35, transparent: true, opacity: 0.58 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.49;
      floor.receiveShadow = true;
      scene.add(floor);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.48, 0.014, 12, 80),
        new THREE.MeshBasicMaterial({ color: 0x59dbe8, transparent: true, opacity: 0.5 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.475;
      scene.add(ring);

      const procedural = buildProceduralTeacher(THREE);
      scene.add(procedural.root);

      let currentVrm: VRM | null = null;
      const vrmBones = new Map<string, VrmBone>();

      const requestedModel = modelUrl.trim();
      if (requestedModel) {
        try {
          const [{ GLTFLoader }, vrmModule] = await Promise.all([
            import("three/addons/loaders/GLTFLoader.js"),
            import("@pixiv/three-vrm"),
          ]);
          if (cancelled) return;
          const loader = new GLTFLoader();
          loader.crossOrigin = "anonymous";
          loader.register((parser) => new vrmModule.VRMLoaderPlugin(parser));
          const gltf = await loader.loadAsync(requestedModel);
          const loadedVrm = gltf.userData.vrm as VRM | undefined;
          if (!loadedVrm) throw new Error("VRM metadata missing");
          vrmModule.VRMUtils.removeUnnecessaryVertices(gltf.scene);
          vrmModule.VRMUtils.combineSkeletons(gltf.scene);
          vrmModule.VRMUtils.combineMorphs(loadedVrm);
          vrmModule.VRMUtils.rotateVRM0(loadedVrm);
          loadedVrm.scene.traverse((item) => { item.frustumCulled = false; });

          const bounds = new THREE.Box3().setFromObject(loadedVrm.scene);
          const size = bounds.getSize(new THREE.Vector3());
          const scale = size.y > 0.01 ? 2.85 / size.y : 1;
          loadedVrm.scene.scale.setScalar(scale);
          const scaledBounds = new THREE.Box3().setFromObject(loadedVrm.scene);
          const center = scaledBounds.getCenter(new THREE.Vector3());
          loadedVrm.scene.position.x -= center.x;
          loadedVrm.scene.position.y += -0.48 - scaledBounds.min.y;
          loadedVrm.scene.position.z -= center.z;
          scene.add(loadedVrm.scene);
          procedural.root.visible = false;
          currentVrm = loadedVrm;

          for (const boneName of ["head", "neck", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm"] as const) {
            const node = loadedVrm.humanoid?.getNormalizedBoneNode(boneName);
            if (node) vrmBones.set(boneName, { node, base: node.quaternion.clone() });
          }
          setModelStatus("vrm");
        } catch {
          if (!cancelled) setModelStatus("fallback");
        }
      }

      const updateSize = () => {
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      updateSize();
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(mount);

      const clock = new THREE.Clock();
      let elapsed = 0;
      const offsetQuaternion = new THREE.Quaternion();

      function poseBone(name: string, x: number, y: number, z: number) {
        const bone = vrmBones.get(name);
        if (!bone) return;
        offsetQuaternion.setFromEuler(new THREE.Euler(x, y, z));
        bone.node.quaternion.copy(bone.base).multiply(offsetQuaternion);
      }

      function animate() {
        if (cancelled) return;
        animationFrame = requestAnimationFrame(animate);
        const delta = Math.min(clock.getDelta(), 0.05);
        elapsed += delta;
        const currentMotion = motionRef.current;
        const signal = audioSignals.current || { open: 0, wide: 0, round: 0 };
        const speaking = currentMotion === "speaking";
        const thinking = currentMotion === "thinking";
        const listening = currentMotion === "listening";
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const bodyAmount = reducedMotion ? 0.25 : 1;
        const blink = blinkAmount(elapsed);
        const breath = Math.sin(elapsed * 1.7) * 0.012 * bodyAmount;

        ring.rotation.z += delta * 0.13;
        procedural.root.position.y = breath;
        procedural.head.rotation.y = Math.sin(elapsed * 0.58) * 0.045 * bodyAmount;
        procedural.head.rotation.z = Math.sin(elapsed * 0.42) * 0.018 * bodyAmount + (listening ? -0.025 : 0);
        procedural.head.rotation.x = thinking ? -0.04 : listening ? -0.015 : 0;
        procedural.mouth.scale.y = 0.24 + (speaking ? signal.open * 1.65 : 0);
        procedural.mouth.scale.x = 1.12 + (speaking ? signal.wide * 0.38 - signal.round * 0.18 : 0);
        procedural.leftEye.scale.y = 1 - blink * 0.88;
        procedural.rightEye.scale.y = 1 - blink * 0.88;

        const gesture = speaking ? Math.sin(elapsed * 2.15) : 0;
        const slowGesture = speaking ? Math.sin(elapsed * 0.92) : 0;
        procedural.leftShoulder.rotation.z = 0.07 + bodyAmount * (speaking ? 0.18 + gesture * 0.07 : thinking ? 0.11 : 0);
        procedural.rightShoulder.rotation.z = -0.07 - bodyAmount * (speaking ? 0.13 + slowGesture * 0.08 : thinking ? 0.11 : 0);
        procedural.leftShoulder.rotation.x = bodyAmount * (speaking ? 0.12 + slowGesture * 0.09 : 0);
        procedural.rightShoulder.rotation.x = bodyAmount * (speaking ? -0.08 + gesture * 0.07 : 0);
        procedural.leftForearm.rotation.x = bodyAmount * (speaking ? -0.34 - gesture * 0.12 : thinking ? -0.18 : 0);
        procedural.rightForearm.rotation.x = bodyAmount * (speaking ? -0.28 + slowGesture * 0.11 : thinking ? -0.18 : 0);

        if (currentVrm) {
          const armWave = speaking ? Math.sin(elapsed * 1.7) : 0;
          poseBone("head", thinking ? -0.035 : 0, Math.sin(elapsed * 0.55) * 0.035 * bodyAmount, listening ? -0.018 : 0);
          poseBone("neck", 0, Math.sin(elapsed * 0.38) * 0.018 * bodyAmount, 0);
          poseBone("leftUpperArm", speaking ? -0.08 : 0, 0, bodyAmount * (speaking ? -0.10 - armWave * 0.08 : 0));
          poseBone("rightUpperArm", speaking ? -0.06 : 0, 0, bodyAmount * (speaking ? 0.09 + armWave * 0.06 : 0));
          poseBone("leftLowerArm", speaking ? -0.18 - armWave * 0.07 : 0, 0, 0);
          poseBone("rightLowerArm", speaking ? -0.15 + armWave * 0.06 : 0, 0, 0);
          currentVrm.expressionManager?.setValue("blink", blink);
          currentVrm.expressionManager?.setValue("aa", speaking ? signal.open * 0.76 : 0);
          currentVrm.expressionManager?.setValue("ih", speaking ? signal.open * signal.wide * 0.38 : 0);
          currentVrm.expressionManager?.setValue("ou", speaking ? signal.open * signal.round * 0.42 : 0);
          currentVrm.update(delta);
        }

        renderer.render(scene, camera);
      }
      animate();

      cleanupScene = () => {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        resizeObserver?.disconnect();
        scene.traverse((item) => {
          const mesh = item as Object3D & { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } | Array<{ dispose?: () => void }> };
          mesh.geometry?.dispose?.();
          if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose?.());
          else mesh.material?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => {
      if (!cancelled) setModelStatus("fallback");
    });

    return () => {
      cancelled = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      cleanupScene?.();
    };
  }, [audioSignals, modelUrl]);

  return (
    <div className={styles.stage} ref={mountRef}>
      {modelStatus === "fallback" ? (
        <div className={styles.fallbackFigure} aria-hidden="true">
          <span className={styles.fallbackHead} />
          <span className={styles.fallbackBody} />
        </div>
      ) : null}
      <span className={styles.renderBadge}>
        {modelStatus === "vrm" ? "自定义VRM · 本机渲染" : modelStatus === "fallback" ? "兼容模式 · 本机显示" : "内置3D教师 · 本机渲染"}
      </span>
    </div>
  );
}
