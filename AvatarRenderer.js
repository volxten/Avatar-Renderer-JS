const fs = require("fs");
const createGL = require("webgl-stub"); 
const { PNG } = require("pngjs");
const { mat4, vec3 } = require("gl-matrix");

class AvatarRenderer {
    constructor(width = 512, height = 512, headPath = "./head.obj") {
        this.width = width;
        this.height = height;
        this.gl = createGL(width, height, { preserveDrawingBuffer: true, alpha: true });

        this.avatar = {
            headColor: [1, 1, 0],
            torsoColor: [0.7, 0.2, 0.2],
            leftArmColor: [0.2, 0.2, 0.7],
            rightArmColor: [0.2, 0.2, 0.7],
            leftLegColor: [0.2, 0.2, 0.7],
            rightLegColor: [0.2, 0.2, 0.7],
            headDecal: null,
            torsoDecal: null,
            headVertexBuffer: null,
            headVertexCount: 0
        };

        this.torsoSize = [2, 2, 1];
        this.limbSize = [1, 2, 1];
        this.headSize = [1, 1, 1];
        this.hats = [];
        this.cubeVertexBuffer = null;
        this.cubeIndexBuffer = null;
        this.cubeIndexCount = 0;
        this.planeBuffer = null;
        this.planeIndexBuffer = null;
        this.planeIndexCount = 0;

        this._initGL();
        this._createCubeBuffers();
        this._loadHead(headPath);
    }

    _initGL() {
        const gl = this.gl;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);

        const vs = `
        attribute vec3 aPosition;
        attribute vec3 aNormal;
        attribute vec2 aUV;
        uniform mat4 uMVP;
        uniform mat4 uModel;
        varying vec3 vNormal;
        varying vec2 vUV;
        void main() {
            vNormal = mat3(uModel) * aNormal;
            vUV = aUV;
            gl_Position = uMVP * vec4(aPosition, 1.0);
        }`;

        const fs = `
        precision mediump float;
        uniform vec3 uColor;
        uniform vec3 uLightDir;
        uniform sampler2D uDecal;
        uniform bool uUseDecal;
        varying vec3 vNormal;
        varying vec2 vUV;
        void main() {
            vec3 finalUnlitColor = uColor;
            vec4 decalColor = texture2D(uDecal, vUV);

            if(uUseDecal){
                finalUnlitColor = mix(finalUnlitColor, decalColor.rgb, decalColor.a);
            }

            float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
            vec3 finalLitColor = finalUnlitColor * (0.3 + 1.2 * diff);

            float finalAlpha = uUseDecal ? decalColor.a : 1.0;
            gl_FragColor = vec4(finalLitColor, finalAlpha);
        }`;

        const compileShader = (src, type) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
            return s;
        };

        const vsShader = compileShader(vs, gl.VERTEX_SHADER);
        const fsShader = compileShader(fs, gl.FRAGMENT_SHADER);

        const program = gl.createProgram();
        gl.attachShader(program, vsShader);
        gl.attachShader(program, fsShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(program));
        gl.useProgram(program);

        this.program = program;
        this.aPosition = gl.getAttribLocation(program, "aPosition");
        this.aNormal = gl.getAttribLocation(program, "aNormal");
        this.aUV = gl.getAttribLocation(program, "aUV");
        this.uMVP = gl.getUniformLocation(program, "uMVP");
        this.uModel = gl.getUniformLocation(program, "uModel");
        this.uColor = gl.getUniformLocation(program, "uColor");
        this.uLightDir = gl.getUniformLocation(program, "uLightDir");
        this.uDecal = gl.getUniformLocation(program, "uDecal");
        this.uUseDecal = gl.getUniformLocation(program, "uUseDecal");

        const radius = 8, theta = Math.PI / 5, phi = Math.PI / 3.7;
        const camX = radius * Math.sin(phi) * Math.sin(theta);
        const camY = radius * Math.cos(phi);
        const camZ = radius * Math.sin(phi) * Math.cos(theta);
        const camPos = [camX, camY, camZ];
        this.lightDir = vec3.normalize(vec3.create(), camPos);

        this.view = mat4.create();
        mat4.lookAt(this.view, camPos, [0, 1, 0], [0, 1, 0]);
        this.proj = mat4.create();
        mat4.perspective(this.proj, Math.PI / 4, this.width / this.height, 0.1, 100);
    }

    _loadObj(path) {
        if (!fs.existsSync(path)) {
            console.error(`OBJ file not found at path: ${path}`);
            return { vertexBuffer: null, vertexCount: 0 };
        }
        
        const obj = fs.readFileSync(path, "utf-8").split("\n");
        const positions = [], normals = [], uvs = [], verts = [];
        for (let line of obj) {
            line = line.trim();
            if (line.startsWith("v ")) { const [, x, y, z] = line.split(/\s+/); positions.push([parseFloat(x), parseFloat(y), parseFloat(z)]); }
            else if (line.startsWith("vn ")) { const [, x, y, z] = line.split(/\s+/); normals.push([parseFloat(x), parseFloat(y), parseFloat(z)]); }
            else if (line.startsWith("vt ")) { const [, u, v] = line.split(/\s+/); uvs.push([parseFloat(u), parseFloat(v)]); }
            else if (line.startsWith("f ")) {
                const parts = line.slice(2).split(" ");
                for (let p of parts) {
                    const indices = p.split("/").map(n => parseInt(n) - 1);
                    const v = indices[0];
                    const vt = (indices.length > 1 && indices[1] !== -1 && uvs[indices[1]]) ? indices[1] : null;
                    const vn = (indices.length > 2 && indices[2] !== -1 && normals[indices[2]]) ? indices[2] : null;
                    verts.push(...positions[v]);
                    verts.push(...(vn !== null ? normals[vn] : [0, 0, 0]));
                    verts.push(vt !== null ? uvs[vt][0] : 0, vt !== null ? 1 - uvs[vt][1] : 0);
                }
            }
        }
        
        if (verts.length === 0) {
            console.warn(`OBJ file at path: ${path} contains no vertices. Returning null buffer.`);
            return { vertexBuffer: null, vertexCount: 0 };
        }

        const gl = this.gl;
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
        return { vertexBuffer, vertexCount: verts.length / 8 };
    }

    _loadHead(path) {
        const { vertexBuffer, vertexCount } = this._loadObj(path);
        this.avatar.headVertexBuffer = vertexBuffer;
        this.avatar.headVertexCount = vertexCount;
    }

    _loadDecalTexture(path) {
        if (!fs.existsSync(path)) {
            console.error(`Texture file not found at path: ${path}`);
            return null;
        }

        const gl = this.gl;
        const png = PNG.sync.read(fs.readFileSync(path));
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, png.width, png.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, png.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return texture;
    }

    setPartColor(part, color) {
        const key = part + "Color";
        if (this.avatar.hasOwnProperty(key)) this.avatar[key] = color;
    }

    setPartDecal(part, path) {
        if (part === "head") this.avatar.headDecal = this._loadDecalTexture(path);
        else if (part === "torso") this.avatar.torsoDecal = this._loadDecalTexture(path);
    }

    setHat(config) {
        if (!Array.isArray(config)) config = [config];
        this.hats = [];
        for (const hat of config) {
            const meshData = this._loadObj(hat.mesh);
            const texture = hat.texture ? this._loadDecalTexture(hat.texture) : null;
            this.hats.push({
                scale: hat.scale || [1, 1, 1],
                position: hat.position || [0, 0, 0],
                color: hat.color || this.avatar.headColor,
                texture,
                ...meshData
            });
        }
    }

    _drawMesh(pos, scale, color, rotation, vertexBuffer, vertexCount, texture = null, applyLighting = true) {
        if (!vertexBuffer) return;
        const gl = this.gl;
        gl.useProgram(this.program);

        const model = mat4.create();
        mat4.translate(model, model, pos);
        mat4.scale(model, model, scale);
        
        if (rotation) {
            mat4.rotate(model, model, 1, rotation)
        }

        const mvp = mat4.create();
        mat4.multiply(mvp, this.view, model);
        mat4.multiply(mvp, this.proj, mvp);

        gl.uniformMatrix4fv(this.uMVP, false, mvp);
        gl.uniformMatrix4fv(this.uModel, false, model);

        const light = applyLighting ? this.lightDir : [0, 0, 0];
        gl.uniform3fv(this.uLightDir, light);
        
        gl.uniform3fv(this.uColor, new Float32Array(color));

        if (texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(this.uDecal, 0);
            gl.uniform1i(this.uUseDecal, true);
        } else {
            gl.uniform1i(this.uUseDecal, false);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 8 * 4, 0);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 8 * 4, 3 * 4);
        gl.enableVertexAttribArray(this.aUV);
        gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, 8 * 4, 6 * 4);

        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    }


    _drawCube(pos, scale, color) {
        if (!this.cubeVertexBuffer) return;
        const gl = this.gl;
        gl.useProgram(this.program);

        const model = mat4.create();
        mat4.translate(model, model, pos);
        mat4.scale(model, model, scale);

        const mvp = mat4.create();
        mat4.multiply(mvp, this.view, model);
        mat4.multiply(mvp, this.proj, mvp);

        gl.uniformMatrix4fv(this.uMVP, false, mvp);
        gl.uniformMatrix4fv(this.uModel, false, model);
        
        gl.uniform3fv(this.uColor, new Float32Array(color));
        
        gl.uniform3fv(this.uLightDir, this.lightDir);
        gl.uniform1i(this.uUseDecal, false);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVertexBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 8 * 4, 0);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 8 * 4, 3 * 4);
        gl.enableVertexAttribArray(this.aUV);
        gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, 8 * 4, 6 * 4);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);
        gl.drawElements(gl.TRIANGLES, this.cubeIndexCount, gl.UNSIGNED_SHORT, 0);
    }

    _drawHead(yOffset = 0) {
        const headCenterY = 2 + this.headSize[1] / 2;
        this._drawMesh([0, headCenterY + yOffset, 0], this.headSize, this.avatar.headColor,
            null, 
            this.avatar.headVertexBuffer, this.avatar.headVertexCount);
    }

    _drawDecalPlane(pos, scale, texture, rotate = false, rotationY = 0) {
        if (!texture) return;
        const gl = this.gl;
        const model = mat4.create();
        mat4.translate(model, model, pos);
        if (rotate) mat4.rotateY(model, model, rotationY);
        mat4.scale(model, model, scale);

        const mvp = mat4.create();
        mat4.multiply(mvp, this.view, model);
        mat4.multiply(mvp, this.proj, mvp);

        gl.uniformMatrix4fv(this.uMVP, false, mvp);
        gl.uniformMatrix4fv(this.uModel, false, model);
        
        gl.uniform3fv(this.uColor, new Float32Array([1, 1, 1]));
        
        gl.uniform3fv(this.uLightDir, this.lightDir);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(this.uDecal, 0);
        gl.uniform1i(this.uUseDecal, true);

        if (!this.planeBuffer) {
            const verts = [-0.5, -0.5, 0, 0, 0, 1, 0, 1, 0.5, -0.5, 0, 0, 0, 1, 1, 1, 0.5, 0.5, 0, 0, 0, 1, 1, 0, -0.5, 0.5, 0, 0, 0, 1, 0, 0];
            const indices = [0, 1, 2, 0, 2, 3];
            this.planeBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.planeBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
            this.planeIndexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.planeIndexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
            this.planeIndexCount = indices.length;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.planeBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 8 * 4, 0);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 8 * 4, 3 * 4);
        gl.enableVertexAttribArray(this.aUV);
        gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, 8 * 4, 6 * 4);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.planeIndexBuffer);

        gl.depthMask(false);
        gl.depthFunc(gl.LEQUAL);
        gl.drawElements(gl.TRIANGLES, this.planeIndexCount, gl.UNSIGNED_SHORT, 0);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
    }


    render() {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const Y_TRANS = -0.8;

        this._drawCube([0, 1 + Y_TRANS, 0], this.torsoSize, this.avatar.torsoColor);
        if (this.avatar.torsoDecal) this._drawDecalPlane([0, 1 + Y_TRANS, this.torsoSize[2] / 2 + 0.01], [this.torsoSize[0], this.torsoSize[1], 1], this.avatar.torsoDecal, true);

        this._drawCube([-1.5, 1 + Y_TRANS, 0], this.limbSize, this.avatar.leftArmColor);
        this._drawCube([1.5, 1 + Y_TRANS, 0], this.limbSize, this.avatar.rightArmColor);
        this._drawCube([-0.5, -1 + Y_TRANS, 0], this.limbSize, this.avatar.leftLegColor);
        this._drawCube([0.5, -1 + Y_TRANS, 0], this.limbSize, this.avatar.rightLegColor);

        const headCenterY = 2 + this.headSize[1] / 2;
        this._drawHead(Y_TRANS);
        if (this.avatar.headDecal) this._drawDecalPlane([0, headCenterY + Y_TRANS, this.headSize[2] / 2 + 0.12], [1.2, 1.2, 1], this.avatar.headDecal, true);

        for (const hat of this.hats) {
            const hatPos = [hat.position[0], headCenterY + Y_TRANS + hat.position[1], hat.position[2]];
            this._drawMesh(hatPos, hat.scale, hat.color, 
                null, 
                hat.vertexBuffer, hat.vertexCount, hat.texture, true);
        }


        return this._getPNG();
    }

    _getPNG() {
        const gl = this.gl;
        const pixels = Buffer.alloc(this.width * this.height * 4);
        gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const png = new PNG({ width: this.width, height: this.height });
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const src = ((this.height - y - 1) * this.width + x) * 4;
                const dst = (y * this.width + x) * 4;
                png.data[dst] = pixels[src];
                png.data[dst + 1] = pixels[src + 1];
                png.data[dst + 2] = pixels[src + 2];
                png.data[dst + 3] = pixels[src + 3];
            }
        }
        return PNG.sync.write(png);
    }

    _createUnitCubeGeometry() {
        const sx = 1, sy = 1, sz = 1;
        const corners = [[-sx / 2, -sy / 2, -sz / 2], [sx / 2, -sy / 2, -sz / 2], [sx / 2, sy / 2, -sz / 2], [-sx / 2, sy / 2, -sz / 2], [-sx / 2, -sy / 2, sz / 2], [sx / 2, -sy / 2, sz / 2], [sx / 2, sy / 2, sz / 2], [-sx / 2, sy / 2, sz / 2]];
        const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5]];
        const normals = [[0, 0, -1], [0, 0, 1], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0]];
        const positions = [], indices = [];
        for (let f = 0; f < faces.length; f++) {
            const idx = faces[f]; const n = normals[f];
            const verts = [...corners[idx[0]], ...n, 0, 0, ...corners[idx[1]], ...n, 1, 0, ...corners[idx[2]], ...n, 1, 1, ...corners[idx[3]], ...n, 0, 1];
            const start = positions.length / 8; positions.push(...verts); indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
        return { positions, indices };
    }

    _createCubeBuffers() {
        const gl = this.gl;
        const { positions, indices } = this._createUnitCubeGeometry();

        this.cubeVertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        this.cubeIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
        this.cubeIndexCount = indices.length;
    }
}

module.exports = AvatarRenderer;
