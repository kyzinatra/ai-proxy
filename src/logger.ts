import { createLogger, format, transports, type transport } from "winston";
import { config } from "./config.js";

const { combine, timestamp, printf, colorize, json, errors } = format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
	const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
	return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

const prodFormat = combine(errors({ stack: true }), timestamp(), json());

const baseFormat =
	config.NODE_ENV === "development"
		? combine(errors({ stack: true }), timestamp(), colorize(), devFormat)
		: prodFormat;

const baseTransports: transport[] = [new transports.Console()];

if (config.NODE_ENV === "production") {
	baseTransports.push(
		new transports.File({
			filename: "logs/app.log",
			level: "info",
			maxsize: 100 * 1024 * 1024, // 100MB
			maxFiles: 5,
		})
	);
}

export const logger = createLogger({
	level: config.NODE_ENV === "development" ? "debug" : "info",
	format: baseFormat,
	transports: baseTransports,
	exitOnError: false,
});

export default logger;
