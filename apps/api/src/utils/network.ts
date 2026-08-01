import os from 'os';

export function getNetworkAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const interfaceName of Object.keys(interfaces)) {
    const netInterface = interfaces[interfaceName];
    if (!netInterface) continue;

    for (const info of netInterface) {
      if (info.family === 'IPv4' && !info.internal) {
        addresses.push(info.address);
      }
    }
  }

  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}
