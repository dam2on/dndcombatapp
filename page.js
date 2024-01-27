
PIECES = [];
_connectedIds = [];
_bgImgUrl = null;
_peer = null;
_host = null;
_ctx = null;

const newGuid = function () {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

const toBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
});

const shapeIntersects = function (x, y) {
  let xInts = false;
  let yInts = false;

  for (var shape of this.PIECES) {
    xInts = x >= shape.x && x <= (shape.x + shape.width);
    if (xInts) {
      yInts = y >= shape.y && y <= (shape.y + shape.height);
      if (yInts)
        return shape;
    }
    xInts = false;
  }
  return null;
}

const refreshCanvas = function () {

  _ctx.clearRect(0, 0, _ctx.canvas.width, _ctx.canvas.height);

  for (var piece of PIECES) {
    _ctx.drawImage(piece.image, piece.x, piece.y, piece.width, piece.height);
    _ctx.fillText(piece.name, piece.x + 10, piece.y);
  }

}

const onChangeBackgroundModalAccept = function() {
  if (_host != null) {
    console.warn("only host can change bg");
    return;
  }
  const bgImg = document.getElementById("input-bg-img").files[0];
  return Promise.resolve(toBase64(bgImg)).then((dataUrl) => {
    setBackground(dataUrl);
    bootstrap.Modal.getInstance(document.getElementById('modal-bg')).hide();
    for (var id of _connectedIds) {
      emitChangeBackgroundEvent(id, dataUrl);
    }
  });
}

const setBackground = function(imgUrl) {
  _bgImgUrl = imgUrl;
  document.getElementById("canvas").style['background-image'] = `url(${_bgImgUrl})`;
  refreshCanvas();
}

const drawImageScaled = function (img) {
  var canvas = _ctx.canvas ;
  var hRatio = canvas.width  / img.width    ;
  var vRatio =  canvas.height / img.height  ;
  var ratio  = Math.min ( hRatio, vRatio );
  var centerShift_x = ( canvas.width - img.width*ratio ) / 2;
  var centerShift_y = ( canvas.height - img.height*ratio ) / 2;  
  _ctx.clearRect(0,0,canvas.width, canvas.height);
  _ctx.drawImage(img, 0,0, img.width, img.height,
                     centerShift_x,centerShift_y,img.width*ratio, img.height*ratio);  
}

const onAddGamePieceModalAccept = function() {
  const modalPieceInputs = document.getElementById('form-modal-piece').getElementsByTagName('input');
  const name = modalPieceInputs[0].value;
  const img = modalPieceInputs[1].files[0];
  const size = document.querySelector('input[name="radio-piece-size"]:checked').value;

  const piece = new Piece(newGuid(), _peer.id, name, img, size);
  piece.image.addEventListener('load', () => {
    _ctx.drawImage(piece.image, piece.x, piece.y, piece.width, piece.height);
    bootstrap.Modal.getInstance(document.getElementById('modal-piece')).hide();
    modalPieceInputs[0].value = null;
    modalPieceInputs[1].value = null;
  });

  PIECES.push(piece);

  debugger;
  if (_host != null) {
    emitAddPieceEvent(_host, piece);
  }
  else if (_connectedIds.length > 0) {
    for (var id of _connectedIds) {
      emitAddPieceEvent(id, piece);
    }
  }
}

const emitChangeBackgroundEvent = function(peerId, imgData) {
  var conn = _peer.connect(peerId);
  conn.on('open', function() {
    conn.send({event: EventTypes.ChangeBackground, img: imgData});
  });
}


const emitAddPieceEvent = function(peerId, piece) {
  var conn = _peer.connect(peerId);
  conn.on('open', function() {
    let pieceCopy = {...piece};
    pieceCopy.image = piece.image.src;
    conn.send({event: EventTypes.AddPiece, piece: pieceCopy});
  })
}

const emitMovePieceEvent = function(peerId, piece) {
  var conn = _peer.connect(peerId);
  conn.on('open', function() {
    conn.send({
      event: EventTypes.MovePiece, 
      movedPiece: {
        id: piece.id,
        x: piece.x,
        y: piece.y
      }
    });
  });
}

const emitDeletePieceEvent = function(peerId, id) {
  var conn = _peer.connect(peerId);
  conn.on('open', function() {
    conn.send({
      event: EventTypes.DeletePiece, 
      id: id
    });
  });
}

const emitRequestPieceEvent = function(pieceId) {
  if (_host == null) {
    console.warn("cannot request piece as host");
    return;
  }
  // fetch piece from host
  var conn = _peer.connect(_host);
  conn.on('open', function() {
    conn.send({
      event: EventTypes.RequestPiece,
      id: pieceId
    });
  });
}

const onAddPieceEvent = async function(piece) {
  if (PIECES.find(p => p.id == piece.id) != null) {
    // redundant piece
    return;
  }
  let newPiece = await Piece.fromObj(piece);
  PIECES.push(newPiece);
  refreshCanvas();
}

const onMovePieceEvent = function(movedPiece) {
  let pieceToMove = PIECES.find(p => p.id == movedPiece.id);
  if (pieceToMove == null) {
    emitRequestPieceEvent(movedPiece.id);
    return;
  }
  pieceToMove.x = movedPiece.x;
  pieceToMove.y = movedPiece.y;
  refreshCanvas();
}

const onDeletePieceEvent = function(id) {
  let piece = PIECES.find(p => p.id == id);
  let index = PIECES.indexOf(piece);
  PIECES.splice(index, 1);
  refreshCanvas();
}

const onRequestPieceEvent = function(peerId, id) {
  let piece = PIECES.find(p => p.id == id);
  emitAddPieceEvent(peerId, piece);
}

const onChangeBackgroundEvent = function(imgUrl) {
  setBackground(imgUrl);
}

const onNewPlayerEvent = function(peerId) {
  _connectedIds.push(peerId);
  emitChangeBackgroundEvent(peerId, _bgImgUrl);
  for (var piece of PIECES) {
    emitAddPieceEvent(peerId, piece);
  }
}

const initParty = function() {
  let mode = Number(document.querySelector('input[name="radio-party"]:checked').value);
  let partyId = document.getElementById("input-party-id").value;

  if (mode == 0) {
    // host mode
    _peer = new Peer(partyId);
  }
    // player mode
  else if (mode == 1) {
    _host = partyId;
    _peer = new Peer();

    // hide change bg button
    var btnChangeBg = document.getElementById("btn-change-bg");
    btnChangeBg.setAttribute("style", "display: none");
  }

  _peer.on('open', function(id) {
    console.log('My peer ID is: ' + id);
    if (mode == 1 && _host != null) {
      // say hello to host
      var conn = _peer.connect(_host);
      conn.on('open', function() {
        conn.send({
          event: EventTypes.NewPlayer
        });
      });
    }
  });

  _peer.on('connection', function(conn) {
    conn.on('data', function(data) {
      debugger;
      switch (data.event) {
        case EventTypes.AddPiece:
          onAddPieceEvent(data.piece);
          break;
        case EventTypes.MovePiece:
          onMovePieceEvent(data.movedPiece);
          break;
        case EventTypes.DeletePiece:
          onDeletePieceEvent(data.id);
          break;
        case EventTypes.RequestPiece:
          onRequestPieceEvent(conn.peer, data.id);
          break;
        case EventTypes.NewPlayer:
          onNewPlayerEvent(conn.peer);
          break;
        case EventTypes.ChangeBackground:
          onChangeBackgroundEvent(data.img);
          break;
        default:
          console.log("unrecognized event type: " + data.event);
          break;
      }
    });
  });

  bootstrap.Modal.getInstance(document.getElementById('modal-party')).hide();
}

window.onload = function () {
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-party')).show(); 

  var can = document.getElementById('canvas');
  _ctx = can.getContext('2d');
  can.width = window.innerWidth;
  can.height = window.innerHeight;

  document.getElementById('btn-modal-piece-ok').addEventListener('click', () => onAddGamePieceModalAccept());
  document.getElementById('btn-modal-bg-ok').addEventListener('click', () => onChangeBackgroundModalAccept());
  document.getElementById('btn-modal-party-ok').addEventListener('click', () => initParty());

  var draggedPiece = null;
  can.addEventListener('mousedown', function (args) {
    draggedPiece = shapeIntersects(args.x, args.y);
  });
  can.addEventListener('mousemove', function (args) {
    if (draggedPiece != null) {
      draggedPiece.x = args.x - parseInt(draggedPiece.width / 2);
      draggedPiece.y = args.y - parseInt(draggedPiece.height / 2);
      refreshCanvas();
    }
  });
  can.addEventListener('mouseup', function () {
    if (draggedPiece == null) return;
    let movedPiece = {...draggedPiece};

    if (_host != null) {
      emitMovePieceEvent(_host, movedPiece);
    }
    else if (_connectedIds.length > 0) {
      for (var id of _connectedIds) {
        emitMovePieceEvent(id, movedPiece);
      }
    }

    draggedPiece = null;
  });

  can.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    let piece = shapeIntersects(e.clientX, e.clientY);
    if (piece) {
      if (confirm("Delete piece: " + piece.name + "?")) {
        let index = PIECES.indexOf(piece);
        PIECES.splice(index, 1);
        refreshCanvas();

        if (_host != null) {
          emitDeletePieceEvent(_host, piece.id);
        }
        else if (_connectedIds.length > 0) {
          for (var id of _connectedIds) {
            emitDeletePieceEvent(id, piece.id);
          }
        }
      }
    }

  })
}