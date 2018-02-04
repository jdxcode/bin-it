import {Command, flags} from '@anycli/command'
import * as qq from 'qqjs'

export default class Build extends Command {
  static flags = {
    os: flags.string({required: true}),
    arch: flags.string({required: true}),
    channel: flags.string({required: true}),
  }

  bin!: string
  channel!: string
  name!: string
  version!: string
  shortVersion!: string
  versionedBase!: string
  unversionedBase!: string
  debVersion!: string
  nodeVersion = process.versions.node
  arch = 'x64'
  os = 'darwin'
  root = qq.cwd()
  tmp = qq.path.join(this.root, 'tmp', 'package')
  dist = qq.path.join(this.root, 'dist')
  tgzPath!: string
  txzPath!: string

  async run() {
    const {flags} = this.parse(Build)
    this.channel = flags.channel
    this.os = flags.os
    this.arch = flags.arch
    const {name, version, ...pjson} = qq.readJSON([this.root, 'package.json'])
    pjson['bin-it'] = pjson['bin-it'] || {}
    if (pjson['bin-it'].node) this.nodeVersion = pjson['bin-it'].node
    this.bin = pjson.anycli.bin || Object.keys(pjson.bin) || pjson.name
    this.name = name
    const sha = qq.x('git', ['rev-parse', '--short', 'HEAD']).stdout
    this.version = `${version}-${sha}`
    this.shortVersion = version
    this.debVersion = `${this.shortVersion}-1`
    this.versionedBase = `${this.name}-v${this.version}-${this.os}-${this.arch}`
    this.unversionedBase = `heroku-cli-${this.os}-${this.arch}`
    this.tgzPath = qq.path.join(this.dist, this.unversionedBase + '.tar.gz')
    this.txzPath = qq.path.join(this.dist, this.unversionedBase + '.tar.xz')
    this.writeJSFiles()
    this.fetchNodeBin()

    const sha256gz = qq.x(`shasum - a 256 '${this.tgzPath}' | awk \{'print $1'\}`).stdout
    const sha256xz = qq.x(`shasum - a 256 '${this.txzPath}' | awk \{'print $1'\}`).stdout

    qq.writeJSON(`${this.dist}/${this.os}-${this.arch}`, {
      channel: this.channel,
      version: this.version,
      sha256gz,
      sha256xz,
    })
  }

writeJSFiles() {
  const tarball = qq.path.join(this.root, `${this.name}-v${this.shortVersion}.tgz`)
  qq.rm(this.tmp)
  qq.mkdirp([this.tmp, '..'])
  qq.x('yarn')
  qq.x('yarn run prepublishOnly')
  qq.x('yarn pack')
  qq.cd([this.tmp, '..'])
  qq.x(`tar xvzf ${tarball}`)
  qq.rm(tarball)
  qq.cp([this.root, 'yarn.lock'], this.tmp)
  qq.x('yarn install --production --non-interactive')
  qq.write([this.tmp, 'bin', this.bin], `#!/usr/bin/env bash
set -e
get_script_dir () {
  SOURCE="\${BASH_SOURCE[0]}"
  # While \$SOURCE is a symlink, resolve it
  while [ -h "\$SOURCE" ]; do
    DIR="\$( cd -P "\$( dirname "\$SOURCE" )" && pwd )"
    SOURCE="\$( readlink "\$SOURCE" )"
    # If \$SOURCE was a relative symlink (so no "/" as prefix, need to resolve it relative to the symlink base directory
    [[ \$SOURCE != /* ]] && SOURCE="\$DIR/\$SOURCE"
  done
  DIR="\$( cd -P "\$( dirname "\$SOURCE" )" && pwd )"
  echo "\$DIR"
}
DIR=\$(get_script_dir)
# normalize home directory
CLI_HOME=\$(cd && pwd)
XDG_DATA_HOME=\${XDG_DATA_HOME:="\$CLI_HOME/.local/share"}
CLIENT_DIR="\$XDG_DATA_HOME/${this.bin}/client"
BIN_DIR="\$CLIENT_DIR/bin"
if [ -x "\$BIN_DIR/${this.bin}" ] && [[ "\$DIR" != "\$CLIENT_DIR"* ]]; then
  if [ "\$DEBUG" == "*" ]; then
    echo "\$XDG_DATA_HOME/${this.bin}/client/bin/${this.bin}" "\$@"
  fi
  "\$XDG_DATA_HOME/${this.bin}/client/bin/${this.bin}" "\$@"
else
  if [ "\$DEBUG" == "*" ]; then
    echo ${this.scopedEnvVarKey('CLI_BINPATH')}="\$DIR/${this.bin}" "\$DIR/node" "\$DIR/${this.bin}.js" "\$@"
  fi
  ${this.scopedEnvVarKey('CLI_BINPATH')}="\$DIR/${this.bin}" "\$DIR/node" "\$DIR/${this.bin}.js" "\$@"
fi
`)
  qq.chmod([this.tmp, 'bin', this.bin], 0o755)
  }

  scopedEnvVarKey(k: string) {
    return [this.bin, k]
    .map(p => p.replace(/-/g, '_'))
    .join('_')
    .toUpperCase()
  }

  fetchNodeBin() {
    if (this.os === 'win32') {
      // const nodeExt = '.exe'
      // const nodeBase = `node-v${this.nodeVersion}-win-${this.arch}`
      // const url = `https://nodejs.org/dist/v${this.nodeVersion}/node-v${this.nodeVersion}-win-${this.arch}.7z`
      // qq.x(`curl -fSsLo ${this.tmp}/node/${nodeBase}.7z ${url}`)
      // qq.cd([this.tmp, 'node'])
      // 7z x -bd -y "${TMP_DIR}/node/${node_base}.7z" > /dev/null
      // mv "${node_base}/node.exe" "$TMP_DIR/cache/node/${node_base}"
    } else {
      const nodeArch = this.arch === 'arm' ? 'armv7l' : this.arch
      const nodeBase = `node-v${this.nodeVersion}-${this.os}-${nodeArch}`
      const url = `https://nodejs.org/dist/v${this.nodeVersion}/${nodeBase}.tar.xz`
      qq.mkdirp([this.tmp, 'node'])
      qq.x(`curl -fSsL "${url}" | tar -C "${this.tmp}/node" -xJ`)
      qq.mv(`${this.tmp}/../node/${nodeBase}/bin/node`, [this.tmp, '/bin/node'])
    }
  }
}
