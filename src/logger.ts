import { createLogger, format, transports } from "winston";
import { config } from "./config.js";

const { combine, timestamp, printf, colorize, json, errors } = format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
	const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
	return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

export const logger = createLogger({
	level: config.NODE_ENV === "development" ? "debug" : "info",
	format: combine(
		errors({ stack: true }),
		timestamp(),
		config.NODE_ENV === "development" ? combine(colorize(), devFormat) : json()
	),
	transports: [new transports.Console()],
	exitOnError: false,
});

export default logger;
