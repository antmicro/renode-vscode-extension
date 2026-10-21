# Renode demo

Nucleo H753ZI running the Zephyr `uart_passthrough` sample - what you type into `usart3` comes out of `usart2`.

1. Run `./fetch.sh` to download the ELF and the Zephyr sources it was built from.
2. Open this folder in VS Code and start **Renode demo**.
3. Open `sources/zephyr/samples/drivers/uart/passthrough/src/main.c` and set a breakpoint on line 79 (`uart_fifo_read`).
4. Type into the `usart3` terminal. The breakpoint hits, and you can step into `drivers/serial/uart_stm32.c`.
5. Continue. The character shows up in the `usart2` terminal.
