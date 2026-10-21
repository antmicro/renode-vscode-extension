#!/usr/bin/env bash
# Downloads the demo binary and the Zephyr sources it was built from.
set -euo pipefail

cd "$(dirname "$0")"

SHA1=cca49317c5a6abd6a18131c4f723b1197efc160f
curl -fL -o uart_passthrough.elf \
  "https://dl.antmicro.com/projects/renode/nucleo_h753zi--zephyr-samples_uart_passthrough.elf-s_530608-$SHA1"
echo "$SHA1  uart_passthrough.elf" | sha1sum -c -

if [ ! -d sources/zephyr ]; then
  git clone -q --depth 1 --branch v4.2.0 --filter=blob:none --sparse \
    https://github.com/zephyrproject-rtos/zephyr sources/zephyr
fi
git -C sources/zephyr sparse-checkout set \
  samples/drivers/uart/passthrough arch/arm soc/st/stm32 drivers/serial include/zephyr kernel lib
