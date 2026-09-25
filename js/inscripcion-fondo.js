/* El código de inscripcion.html.

   Vivía escrito dentro de la página, en un <script> de 6 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        document.getElementById('current-year').textContent = new Date().getFullYear();

        // three.js pesa ~600 KB y es SOLO el decorado de fondo. Antes se pedía con un
        // <script> en el <head>, que frena el dibujo de la página hasta bajarlo entero:
        // en un celular con poca señal, el formulario tardaba en aparecer por una
        // animación. Ahora se pide cuando la página ya terminó de cargar, y la
        // animación arranca cuando llega. Si no llega, el formulario funciona igual.
        function fondo3D() {
            // En celular esta animación de fondo es puro decorado (el formulario tapa casi
            // todo el canvas) pero un WebGLRenderer a pantalla completa con antialiasing y
            // devicePixelRatio alto es justo lo que más batería/GPU gasta en un teléfono —
            // se reduce la calidad ahí en vez de sacrificarla también en escritorio.
            const esPantallaChica = window.innerWidth < 768;
            const prefiereMenosMovimiento = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            const canvas = document.getElementById('bg-3d');
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: !esPantallaChica });

            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, esPantallaChica ? 1.5 : 2));

            const ambientLight = new THREE.AmbientLight(0x22c55e, 0.7);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
            dirLight.position.set(10, 20, 15);
            scene.add(dirLight);

            const pointLight = new THREE.PointLight(0x16a34a, 2, 50);
            pointLight.position.set(-10, -10, 10);
            scene.add(pointLight);

            function crearGeometriaPieza(tipo) {
                const points = [];
                if (tipo === 'pawn') {
                    points.push(new THREE.Vector2(0, 0));
                    points.push(new THREE.Vector2(0.8, 0));
                    points.push(new THREE.Vector2(0.7, 0.2));
                    points.push(new THREE.Vector2(0.4, 0.5));
                    points.push(new THREE.Vector2(0.3, 1.2));
                    points.push(new THREE.Vector2(0.5, 1.4));
                    points.push(new THREE.Vector2(0.2, 1.5));
                    points.push(new THREE.Vector2(0.6, 1.9));
                    points.push(new THREE.Vector2(0, 2.3));
                } else if (tipo === 'rook') {
                    points.push(new THREE.Vector2(0, 0));
                    points.push(new THREE.Vector2(0.9, 0));
                    points.push(new THREE.Vector2(0.8, 0.3));
                    points.push(new THREE.Vector2(0.5, 0.6));
                    points.push(new THREE.Vector2(0.5, 1.8));
                    points.push(new THREE.Vector2(0.7, 2.0));
                    points.push(new THREE.Vector2(0.7, 2.5));
                    points.push(new THREE.Vector2(0, 2.5));
                } else {
                    points.push(new THREE.Vector2(0, 0));
                    points.push(new THREE.Vector2(1.0, 0));
                    points.push(new THREE.Vector2(0.8, 0.3));
                    points.push(new THREE.Vector2(0.4, 0.8));
                    points.push(new THREE.Vector2(0.3, 2.0));
                    points.push(new THREE.Vector2(0.7, 2.3));
                    points.push(new THREE.Vector2(0.5, 2.7));
                    points.push(new THREE.Vector2(0.8, 3.1));
                    points.push(new THREE.Vector2(0, 3.4));
                }
                return new THREE.LatheGeometry(points, 24);
            }

            const materialPieza = new THREE.MeshPhongMaterial({
                color: 0x22c55e,
                emissive: 0x14532d,
                specular: 0xdcfce7,
                shininess: 40,
                transparent: true,
                opacity: 0.20
            });

            const tipos = ['pawn', 'rook', 'king'];
            const piezas = [];
            const numPiezas = esPantallaChica ? 7 : 14;

            for (let i = 0; i < numPiezas; i++) {
                const tipo = tipos[i % tipos.length];
                const geom = crearGeometriaPieza(tipo);
                const mesh = new THREE.Mesh(geom, materialPieza.clone());

                mesh.position.x = (Math.random() - 0.5) * 28;
                mesh.position.y = (Math.random() - 0.5) * 28;
                mesh.position.z = (Math.random() - 0.5) * 15 - 5;

                mesh.rotation.x = Math.random() * Math.PI;
                mesh.rotation.y = Math.random() * Math.PI;

                const scale = 0.6 + Math.random() * 0.6;
                mesh.scale.set(scale, scale, scale);

                mesh.userData = {
                    rotSpeedX: (Math.random() - 0.5) * 0.008,
                    rotSpeedY: (Math.random() - 0.5) * 0.01,
                    floatSpeed: 0.005 + Math.random() * 0.008,
                    floatOffset: Math.random() * Math.PI * 2
                };

                scene.add(mesh);
                piezas.push(mesh);
            }

            camera.position.z = 18;
            let clock = new THREE.Clock();

            function animate() {
                requestAnimationFrame(animate);
                const elapsedTime = clock.getElapsedTime();

                piezas.forEach(p => {
                    p.rotation.x += p.userData.rotSpeedX;
                    p.rotation.y += p.userData.rotSpeedY;
                    p.position.y += Math.sin(elapsedTime * 1.5 + p.userData.floatOffset) * 0.005;
                });

                renderer.render(scene, camera);
            }

            if (prefiereMenosMovimiento) {
                // "Reduce motion" del sistema operativo: se respeta de verdad, no solo se hace
                // más lento — un solo frame estático en vez del loop continuo de animate().
                renderer.render(scene, camera);
            } else {
                animate();
            }

            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });
        }

        function cargarFondo3D() {
            const s = document.createElement('script');
            s.src = 'js/vendor/three.min.js';
            s.onload = fondo3D;
            document.head.appendChild(s);
        }
        if (document.readyState === 'complete') cargarFondo3D();
        else window.addEventListener('load', cargarFondo3D, { once: true });
    