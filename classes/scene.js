class Scene {
    constructor(id, ownerId) {
        this.id = id;
        this.name = "My Scene";
        this.owner = ownerId;
        this.gridRatio = {
            x: 0.025,
            y: 0.025
        };
        this.pieces = [];
        this.unloadedPieces = [];
        this.background = new Background(BackgroundType.Image, 'img/bg.png');

        Object.defineProperty(this, 'canvas', { value: document.getElementById('canvas'), enumerable: false, writable: true });
        Object.defineProperty(this, 'ctx', { value: this.canvas.getContext('2d'), enumerable: false, writable: true });
    }

    static async load(partial) {
        if (partial == null) {
            console.warn("partial value must be provided to load scene");
            return null;
        }
        const scene = new Scene(partial.id, partial.owner);
        scene.name = partial.name;
        scene.thumbnail = partial.thumbnail;
        const piecePromises = [];
        const pieces = await localforage.getItem(`${StorageKeys.Pieces}-${scene.id}`)
        if (pieces != null) {
            for (var piece of pieces) {
                piecePromises.push(piece.objectType == "Area" ? Area.fromObj(piece) : Piece.fromObj(piece));
            }
            await Promise.all(piecePromises).then((pieces) => {
                scene.pieces = pieces;
            });
        }

        const backgroundVal = await localforage.getItem(`${StorageKeys.Background}-${scene.id}`);
        if (backgroundVal != null) {
            scene.background = Background.fromObj(backgroundVal);
        }
        const gridVal = await localforage.getItem(`${StorageKeys.GridRatio}-${scene.id}`);
        if (gridVal != null) {
            scene.gridRatio = gridVal;
        }

        return scene;
    }

    static async fromObj(obj) {
        const scene = new Scene(obj.id, obj.owner);
        scene.name = obj.name;
        scene.gridRatio = obj.gridRatio;
        scene.thumbnail = obj.thumbnail;

        const piecePromises = [];
        for (var piece of obj.pieces) {
            if (typeof(piece) == 'string') {
                // guids detected, let's bail and wait for pieces
                scene.unloadedPieces = obj.pieces;
                break;
            }
            else {
                piecePromises.push(piece.objectType == "Area" ? Area.fromObj(piece) : Piece.fromObj(piece));
            }
        }
        await Promise.all(piecePromises).then((pieces) => {
            scene.pieces = pieces;
        });

        scene.background = Background.fromObj(obj.background);
        return scene;
    }

    static updateOrCreateDom(scene) {
        const existingDom = $(`label[for="option-${scene.id}"]`);
        if (!!existingDom.length) {
            existingDom.find('div').css('background-image', `url(${scene.background.getPosterImgUrl()})`);
            existingDom.find('img').attr('src', scene.canvas.toDataURL());
        }
        else {
            return $(`
            <div class="dropdown">
                <label class="col scene-label dropdown-toggle" onclick="onChangeScene('${scene.id}')" oncontextmenu="onSceneMenu(event, '${scene.id}')" for="option-${scene.id}">
                    <input type="radio" class="btn-check" name="radio-scenes" id="option-${scene.id}">
                    <div class="bg-img-cover" style="background-image: url(${scene.thumbnail?.bg ?? scene.background.getPosterImgUrl()})">
                        <img style="aspect-ratio: 1.75; height: 100%; width: 100%; position: relative; top: 0; left: 0;" src="${scene.thumbnail?.fg ?? scene.canvas.toDataURL()}">
                    </div>
                </label>
                <ul class="dropdown-menu" role="menu">
                    <!-- <li><a class="dropdown-item" onclick="onChangeScene('${scene.id}')" href="javascript:void(0)">Select</a></li> -->
                    <li><a class="dropdown-item" onclick="onDeleteScene('${scene.id}')" href="javascript:void(0)">Delete Scene</a></li>
                </ul>
            </div>`);
        }
    }

    static async delete(id) {
        const deleteScenePartialPromise = new Promise(function (resolve, reject) {
            localforage.getItem(StorageKeys.Scenes).then(function (scenes) {
                scenes = scenes.filter(s => s.id != id);
                localforage.setItem(StorageKeys.Scenes, scenes).then(resolve);
            });
        });

        await Promise.all([deleteScenePartialPromise,
            localforage.removeItem(`${StorageKeys.Pieces}-${id}`),
            localforage.removeItem(`${StorageKeys.Background}-${id}`),
            localforage.removeItem(`${StorageKeys.GridRatio}-${id}`)]);
    }

    async saveScene() {
        let scenes = await localforage.getItem(StorageKeys.Scenes);
        const objForSaving = {
            id: this.id,
            name: this.name,
            owner: this.owner,
            gridRatio: this.gridRatio,
            thumbnail: {
                fg: this.canvas.toDataURL(),
                bg: this.background.getPosterImgUrl()
            }
        };
        if (scenes == null) {
            scenes = [objForSaving];
        }
        else {
            let existingScene = scenes.find(s => s.id == this.id);
            if (existingScene == null) {
                scenes.push(objForSaving);
            }
            else {
                scenes.splice(scenes.indexOf(existingScene), 1, objForSaving);
            }
        }

        await localforage.setItem(StorageKeys.Scenes, scenes);
    }

    getSizeMB() {
        return new Blob([JSON.stringify(this)]).size / Math.pow(10, 6);
    }

    async save() {
        await Promise.all([this.saveScene(), this.saveBackground(), this.saveGrid(), this.savePieces()]);
    }

    async saveBackground() {
        Scene.updateOrCreateDom(this);
        await this.saveScene(); // update thumbnail in storage
        await localforage.setItem(`${StorageKeys.Background}-${this.id}`, this.background);
    }

    async saveGrid() {
        Scene.updateOrCreateDom(this);
        await this.saveScene(); // update thumbnail in storage
        await localforage.setItem(`${StorageKeys.GridRatio}-${this.id}`, this.gridRatio);
    }

    async savePieces() {
        Scene.updateOrCreateDom(this);
        await this.saveScene(); // update thumbnail in storage
        await localforage.setItem(`${StorageKeys.Pieces}-${this.id}`, this.pieces);
    }

    bringPieceToFront(piece) {
        // makes piece appear on top of other pieces by moving to end of pieces array
        const currentIndex = this.pieces.indexOf(piece);
        this.pieces.push(this.pieces.splice(currentIndex, 1)[0]);
    }

    draw() {
        this.drawGridSetting();
        this.drawBackground();
        this.drawPieces();
    }

    drawGridSetting() {
        const valX = parseInt(this.gridRatio.x * this.canvas.width);
        const valY = parseInt(this.gridRatio.y * this.canvas.height);
        $('#range-grid-size-x').val(valX);
        $('#range-grid-size-y').val(valY);
        $('.grid-indicator').css('margin-bottom', (149 - valY) + 'px');
        $('label[for="range-grid-size-x"]').html();

        if (valX != valY) {
            // $('.extra-grid-controls').show();
            // $('#range-grid-size-y').css('width', valX + 'px');
            // $('#range-grid-size-y').attr('max', valX);
            $('.grid-indicator').css('width', valX + 'px');
            $('.grid-indicator').css('height', valY + 'px');
        }
        else {
            // $('.extra-grid-controls').hide();
        }

        $('label[for="range-grid-size-x"]').html(`<i class="fa-solid fa-border-none me-2"></i>Grid Size: ${valX}, ${valY}`);
    }

    drawBackground() {
        return this.background.apply();
    }

    async drawPieces(addTrail = false) {
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        let trailColor = null;
        if (addTrail || document.getElementById('checkbox-route-toggle').checked) {
            trailColor = await this.background.getContrastColor();
        }

        for (var piece of this.pieces) {
            piece.draw(trailColor);
        }
    }

    setBackground(obj) {
        if (obj instanceof Background) {
            this.background = obj;
        }
        else if (obj instanceof Object) {
            const newBg = Background.fromObj(obj);
            this.background = newBg;
        }
        else {
            console.warn("bad argument: " + JSON.stringify(obj));
        }
    }

    async addPiece(piece) {
        let unloadedIndex = this.unloadedPieces.indexOf(piece.id);
        if (unloadedIndex >= 0) {
            this.unloadedPieces.splice(unloadedIndex, 1);
        }
      
        if (piece instanceof Piece) {
            this.pieces.push(piece);
            return piece;
        }

        if (piece instanceof Object) {
            let newPiece = null;

            if (piece.objectType == "Area") {
                newPiece = Area.fromObj(piece);
            }
            else {
                newPiece = await Piece.fromObj(piece);
            }
            this.pieces.push(newPiece);
            return newPiece;
        }

        console.warn("bad argument: " + JSON.stringify(piece));
        return null;
    }

    async updatePiece(piece) {
        let localPiece = this.getPieceById(piece.id);
        if (localPiece instanceof Area) {
            localPiece = await Area.fromObj(piece);
        }
        else {
            if (!piece.imageUpdated) {
                // use same image
                piece.image = localPiece.image;
            }
            localPiece = await Piece.fromObj(piece);
        }

        const index = this.pieces.findIndex(p => p.id == localPiece.id);
        this.pieces.splice(index, 1, localPiece);

        return localPiece;
    }

    deletePiece(piece) {
        let index = this.pieces.indexOf(piece);
        this.pieces.splice(index, 1);
    }

    clearPieces() {
        this.pieces = [];
    }

    getPieceById(id) {
        return this.pieces.find(p => p.id == id);
    }
}
