import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';

const names = ['信标回廊', '废弃栈道', '碎隙捷径', '归航环路', '天降陨石'];
const kinds = ['beacon', 'outer', 'risk', 'safe', 'rock'];
export function resolveCard(id) {
  const match = /^(blue|gold)-0([1-5])$/.exec(id);
  if (!match) return null;
  return {
    card_instance_id: id,
    robot_id: 'rover-' + match[1],
    card_id: kinds[Number(match[2]) - 1],
    name: names[Number(match[2]) - 1],
    side: match[1] === 'blue' ? '蓝方' : '黄方',
  };
}

export function createPhoneGateway({ game, drain, advance, port }) {
  const sessions = new Map();
  const scans = new Map();
  const addresses = Object.values(networkInterfaces()).flat()
    .filter((a) => a.family === 'IPv4' && !a.internal
      && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))
    .map((a) => 'http://' + a.address + ':' + port);
  let error = null;

  function snapshot() {
    const now = Date.now();
    return {
      protocol: 'moonfall-card-scans-v1',
      match_id: game.match,
      game_status: game.status,
      ready: !!(game.link && game.hello && game.sync),
      addresses,
      phones: [...sessions.values()].filter((s) => now - s.seen < 10000)
        .map((s) => ({ name: s.name, last_seen: s.seen })),
    };
  }

  function publicScan(scan) {
    if (scan.status === 'pending' && (Date.now() - scan.created > 10000
        || scan.match_id !== game.match)) {
      scan.status = 'unknown';
      scan.message = '游戏尚未确认结果，请工作人员核对，勿重复出牌';
    }
    const secret = ['risk', 'safe'].includes(scan.card.card_id) && !game.locked;
    return {
      scan_id: scan.scan_id,
      match_id: scan.match_id,
      status: scan.status,
      accepted: scan.accepted,
      consumed: scan.consumed,
      reason: scan.reason,
      side: scan.card.side,
      label: secret ? '路线牌' : scan.card.name,
      message: scan.message,
    };
  }

  function receive(message) {
    if (message.type !== 'card.result') return;
    const p = message.payload;
    const scan = scans.get(p.event_id);
    if (!scan || scan.match_id !== game.match) return;
    scan.status = p.accepted ? 'accepted' : 'rejected';
    scan.accepted = !!p.accepted;
    scan.consumed = !!p.consumed;
    scan.reason = p.reason || '';
    scan.message = p.accepted
      ? (p.consumed ? '出牌成功，天降陨石已生效' : '已锁定')
      : ('拒绝出牌：' + (p.reason || '游戏未接受'));
  }

  function json(res, data, status = 200) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }).end(JSON.stringify(data));
  }

  async function body(req) {
    let data = '';
    for await (const chunk of req) {
      data += chunk;
      if (Buffer.byteLength(data) > 4096) throw Error('请求过大');
    }
    return JSON.parse(data);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(await readFile(new URL('./phone.html', import.meta.url)));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/phone-monitor') {
        json(res, { ...snapshot(), scans: [...scans.values()].slice(-20).reverse().map(publicScan) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/phone/connect') {
        const p = await body(req);
        if (sessions.size >= 100) {
          for (const [token, s] of sessions) {
            if (Date.now() - s.seen > 60000) sessions.delete(token);
          }
          if (sessions.size >= 100) throw Error('连接数已满');
        }
        const token = randomUUID();
        sessions.set(token, { name: String(p.name || '安卓刷卡器').slice(0, 60), seen: Date.now() });
        json(res, { ...snapshot(), token });
        return;
      }
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      const session = sessions.get(token);
      if (!session) {
        json(res, { error: '请先连接电脑' }, 401);
        return;
      }
      session.seen = Date.now();
      if (req.method === 'GET' && url.pathname === '/api/phone/status') {
        json(res, snapshot());
        return;
      }
      if (req.method === 'DELETE' && url.pathname === '/api/phone/connect') {
        sessions.delete(token);
        json(res, { disconnected: true });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/card-scans') {
        const p = await body(req);
        if (typeof p.scan_id !== 'string' || !/^scan-[\w-]{1,80}$/.test(p.scan_id)
            || typeof p.match_id !== 'string' || typeof p.card_instance_id !== 'string') {
          json(res, { error: '刷卡字段无效' }, 400);
          return;
        }
        const old = scans.get(p.scan_id);
        if (old) {
          if (old.token !== token || old.match_id !== p.match_id
              || old.card.card_instance_id !== p.card_instance_id) {
            json(res, { error: 'scan_id 与原刷卡内容冲突' }, 409);
          } else json(res, publicScan(old));
          return;
        }
        if (p.match_id !== game.match) {
          json(res, { error: '比赛已更新，请等待连接状态刷新后重新刷卡' }, 409);
          return;
        }
        for (const [id, old] of scans) {
          if (old.match_id !== game.match) scans.delete(id);
        }
        const card = resolveCard(p.card_instance_id);
        if (!card) {
          json(res, { error: '未登记的实体牌编号' }, 400);
          return;
        }
        advance();
        const scan = {
          ...p, card, token, status: 'pending', accepted: false, consumed: false,
          message: '等待游戏确认', created: Date.now(),
        };
        // Keep all IDs for the current match so retries never execute twice.
        if (scans.size >= 10000) {
          json(res, { error: '本局刷卡记录已满，请工作人员检查' }, 503);
          return;
        }
        scans.set(p.scan_id, scan);
        if (!game.link || !game.hello || !game.sync) {
          scan.status = 'rejected';
          scan.message = '拒绝出牌：游戏或硬件尚未就绪';
        } else {
          game.card({
            event_id: p.scan_id,
            presence_id: p.scan_id,
            robot_id: card.robot_id,
            card_id: card.card_id,
            captured_mono_ms: game.now - game.sync.offset_ms,
          });
          drain();
        }
        json(res, publicScan(scan));
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/card-scans/')) {
        const scan = scans.get(decodeURIComponent(url.pathname.slice('/api/card-scans/'.length)));
        if (!scan || scan.token !== token) json(res, { error: '未找到本次刷卡记录' }, 404);
        else json(res, publicScan(scan));
        return;
      }
      json(res, { error: '接口不存在' }, 404);
    } catch (failure) {
      if (!res.headersSent) json(res, { error: failure.message }, 400);
      else res.end();
    }
  });
  server.on('error', (failure) => {
    error = failure.message;
    console.error('手机读卡入口启动失败：' + error);
  });
  server.listen(port, '0.0.0.0', () => {
    console.log('手机读卡连接窗口  http://127.0.0.1:' + port);
    for (const address of addresses) console.log('手机填写电脑地址  ' + address);
  });
  return { receive, server, snapshot, get error() { return error; } };
}
