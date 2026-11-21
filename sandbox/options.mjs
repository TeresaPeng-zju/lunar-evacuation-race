import { parseArgs } from 'node:util';

export const HELP = `Moonfall 硬件联调

  npm start                        内置无电机模拟器
  npm run hardware                 等待外部硬件适配器
  npm run mock                     另开终端，连接无电机参考客户端

参数（放在 npm 命令的 -- 后）：
  --port 4175                      指定端口，默认 4174
  --profile config/hardware.local.json
                                   实测配置，仅外部硬件模式使用
  --hardware                       等同 npm run hardware
  --help                           显示帮助，不启动服务

  npm run hardware -- --port 4175 --profile config/hardware.local.json
  npm run mock -- ws://127.0.0.1:4175/hardware

服务只监听本机 127.0.0.1。协议和实车准备步骤见 docs/hardware-integration.md。
旧 SANDBOX_PORT、MOONFALL_PROFILE 环境变量仍兼容，命令行参数优先。`;

export function parseOptions(args = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({
    args,
    options: {
      hardware: { type: 'boolean' },
      port: { type: 'string' },
      profile: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  const portText = values.port ?? env.SANDBOX_PORT ?? '4174';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('端口必须是 1–65535 的整数，例如 --port 4175');
  }
  const mode = values.hardware ? 'hardware' : 'simulation';
  const profilePath = values.profile ?? env.MOONFALL_PROFILE ?? null;
  if (profilePath && mode !== 'hardware') {
    throw new Error('实测配置只用于外部硬件模式，请使用 npm run hardware -- --profile <文件>');
  }
  return { help: false, port, mode, profilePath, host: '127.0.0.1' };
}
