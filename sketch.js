on('load', () => {
  
  const degToRad = (d) => d * Math.PI / 180;
  
  const makeRhombus = (type) => {
    const rotation = (type == 'thick') ? 72 : 36;
    const angle = degToRad(rotation);
    
    const A = vec2(60, 0);
    const B = A.turn(angle);
    
    const v0 = vec2(0, 0);
    const v1 = A;
    const v2 = A.add(B);
    const v3 = B;
    
    return {
      type,
      position: vec2(0, 0),
      rotation: 0,
      vertices: [v0, v1, v2, v3],
      color: (type == 'thick') ? '#88c' : '#c88',
    };
  };
  
  const pointInRhombus = (rhombus, x, y) => {
    const dx = x - rhombus.position.x;
    const dy = y - rhombus.position.y;
    const angle = -degToRad(rhombus.rotation);
    const local = vec2(dx, dy).turn(angle);

    let inside = false;
    const verts = rhombus.vertices;
    for (let i = 0, j = verts.length-1; i < verts.length; j = i++) {
      const xi = verts[i].x, yi = verts[i].y;
      const xj = verts[j].x, yj = verts[j].y;
      const intersect = ((yi > local.y) != (yj > local.y)) &&
        (local.x < (xj - xi) * (local.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };
  
  const snapThreshold = 15;    // pixels
  const angleThreshold = 10;   // degrees
  
  const worldVertices = (tile) => {
    const angle = degToRad(tile.rotation);
    return tile.vertices.map(v => {
      const r = v.turn(angle);
      return vec2(r.x + tile.position.x, r.y + tile.position.y);
    });
  };

  const worldEdges = (tile) => {
    const verts = worldVertices(tile);
    const edges = [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i+1)%verts.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      edges.push({ a, b, angle });
    }
    return edges;
  };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  
  const angleDiff = (a, b) => {
    let d = (a - b) % 360;
    if (d < -180) d += 360;
    if (d > 180) d -= 360;
    return Math.abs(d);
  };

  const trySnap = (dragged, allTiles) => {
    const dEdges = worldEdges(dragged);
    for (let other of allTiles) {
      if (other === dragged) continue;
      const oEdges = worldEdges(other);

      for (let de of dEdges) {
        for (let oe of oEdges) {
          const midD = vec2((de.a.x + de.b.x)/2, (de.a.y + de.b.y)/2);
          const midO = vec2((oe.a.x + oe.b.x)/2, (oe.a.y + oe.b.y)/2);

          const d = dist(midD, midO);
          const a = angleDiff(de.angle, oe.angle + 180); // should face opposite

          if (d > snapThreshold || a > angleThreshold) continue;
          const shift = midO.sub(midD);
          dragged.position = dragged.position.add(shift);
          dragged.rotation = Math.round(dragged.rotation / 36) * 36; // quantize
          return true;
        }
      }
    }
    return false;
  }
  
  const c = $('canvas');
  const ctx = c.getContext('2d');
  const bb = c.getBoundingClientRect();
  c.width = bb.width;
  c.height = bb.height;
  
  let tiles = [];
  let draggedTile = null;
  let dragOffset = vec2(0, 0);
  let spawnTile = null;
  
  const drawTile = (tile) => {
    ctx.save();
    
    ctx.translate(tile.position.x, tile.position.y);
    ctx.rotate(degToRad(tile.rotation));
    
    ctx.beginPath();
    ctx.moveTo(tile.vertices[0].x, tile.vertices[0].y);
    for (let i = 1; i < tile.vertices.length; i++) {
      ctx.lineTo(tile.vertices[i].x, tile.vertices[i].y);
    }
    ctx.closePath();
    
    ctx.fillStyle = tile.color;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.stroke();
    
    ctx.restore();
  };
  
  $('#palette').on('mousedown', (e) => {
    const type = e.target.dataset.type;
    if (!type) return;

    spawnTile = makeRhombus(type);
    draggedTile = spawnTile;
    dragOffset = vec2(0, 0);
    tiles.push(spawnTile);
    
    spawnTile.grabLocal = spawnTile.vertices[0].add(spawnTile.vertices[2]).div(2);
    
    c.style.cursor = 'grabbing';
    fsm.setState('dragging');
    fsm.call('mousemove', e);
  });
  
  const tick = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    
    for (const tile of tiles) drawTile(tile);
    
    frame().then(tick);
  };
  frame().then(tick);
  
  const fsm = FSM({
    'idle:mousemove': (e) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      c.style.cursor = 'default';
      for (let t of tiles.slice().reverse()) {
        if (pointInRhombus(t, x, y)) {
          c.style.cursor = 'grab';
        }
      }
    },
    'idle:mousedown': (e) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      for (let t of tiles.slice().reverse()) {
        if (!pointInRhombus(t, x, y)) continue;
        draggedTile = t;
        dragOffset = vec2(x - t.position.x, y - t.position.y);

        const local = vec2(x - t.position.x, y - t.position.y)
          .turn(-degToRad(t.rotation));
        t.grabLocal = local;
        
        c.style.cursor = 'grabbing';
        return 'dragging';
      }
    },
    'dragging:mousemove': (e) => {
      if (!draggedTile) return;
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const grabWorld = draggedTile.grabLocal.turn(degToRad(draggedTile.rotation));
      draggedTile.position = vec2(x - grabWorld.x, y - grabWorld.y);
      trySnap(draggedTile, tiles);
    },
    'dragging:mouseup': (e) => {
      draggedTile = null;
      c.style.cursor = 'grab';
      return 'idle';
    },
    'idle:wheel': (e) => {
      e.preventDefault();
    },
  });
  
  c.on('mousedown', fsm.event('mousedown'));
  c.on('mousemove', fsm.event('mousemove'));
  c.on('mouseup',   fsm.event('mouseup'));
  c.on('wheel',     fsm.event('wheel'));
  
  document.on('keydown', (e) => {
    if (!draggedTile) return;
    if (e.key.toLowerCase() != 'r') return;
    
    const oldRot = draggedTile.rotation;
    draggedTile.rotation = (draggedTile.rotation + 36) % 360;

    const before = draggedTile.grabLocal.turn(degToRad(oldRot));
    const after  = draggedTile.grabLocal.turn(degToRad(draggedTile.rotation));
    draggedTile.position = draggedTile.position.add(before.sub(after));
  });
  
});