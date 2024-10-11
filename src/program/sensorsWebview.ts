// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { RenodePluginContext } from '../context';
import {
  SensorTypeFromString,
  GetSensorValue,
  SensorValue,
} from '../common/sensor';

export class SensorsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'sensors-info';
  private _view?: vscode.WebviewView;
  private extensionCtx: vscode.ExtensionContext;
  private renodeCtx: RenodePluginContext;

  private webviewStyles = `
  body {
    font-family: Arial, sans-serif;
    margin: 20px;
    color: var(--vscode-editor-foreground);
    background-color: var(--vscode-editor-background);
  }
  .webview-container {
    width: 100%;
    height: 100%;
  }
  h1 {
    color: var(--vscode-editor-title-foreground);
  }
  ul {
    list-style-type: none;
    padding: 0;
  }
  input[type="number"] {
    margin-right: 10px;
    padding: 5px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
  }
  button {
    padding: 6px 12px;
    cursor: pointer;
    border: none;
    border-radius: 4px;
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    transition: background-color 0.2s;
  }
  button:hover {
    background-color: var(--vscode-button-hoverBackground);
  }
  button:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--vscode-focusBorder);
  }
`;

  private webviewScript = `
  const vscode = acquireVsCodeApi();

  function applyValue(machine, sensorName, type) {
    const inputId = \`\${machine}-\${sensorName}-\${type}-input\`;
    const newValue = document.getElementById(inputId).value;

    if (newValue) {
      vscode.postMessage({
        command: 'updateSensorValue',
        machine: machine,
        sensorName: sensorName,
        type: type,
        newValue: newValue,
      });
      refresh(); // Refresh the webview after applying the new value
    } else {
      sendNotification('information', 'Please enter a new value.');
    }
  }

  function refresh() {
    vscode.postMessage({
      command: 'refreshSensors',
    });
  }

  function sendNotification(severity, string) {
    vscode.postMessage({
      command: 'sendNotification',
      severity: severity,
      string: string,
    });
  }
`;

  constructor(
    private readonly context: vscode.ExtensionContext,
    renodeCtx: RenodePluginContext,
  ) {
    this.extensionCtx = context;
    this.renodeCtx = renodeCtx;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;
    this.loadSensorsData();

    webviewView.webview.onDidReceiveMessage(
      message => {
        const { command } = message;

        switch (command) {
          case 'updateSensorValue':
            this.updateSensorValue(
              message.machine,
              message.sensorName,
              message.type,
              message.newValue,
            );
            break;

          case 'refreshSensors':
            this.loadSensorsData();
            break;

          case 'sendNotification':
            this.handleNotification(message);
            break;

          default:
            vscode.window.showErrorMessage(
              `Received unknown command: ${command}`,
            );
            break;
        }
      },
      undefined,
      this.extensionCtx.subscriptions,
    );
  }

  private handleNotification(message: { string: string; severity: string }) {
    const { string, severity } = message;
    switch (severity) {
      case 'information':
        vscode.window.showInformationMessage(string);
        break;
      case 'warning':
        vscode.window.showWarningMessage(string);
        break;
      case 'error':
        vscode.window.showErrorMessage(string);
        break;
      default:
        vscode.window.showErrorMessage(
          `Received unknown severity level: ${severity}`,
        );
        break;
    }
  }

  private prettifySensorName(sensorName: string): string {
    const parts = sensorName.split('.');
    if (parts.length === 3) {
      return `${parts[2]} (on ${parts[1]})`;
    }
    return sensorName;
  }

  public loadSensorsData() {
    if (!this.renodeCtx.isDebugging) {
      this._view!.webview.html = `
        <style>${this.webviewStyles}</style>
        <h1>Sensors Data</h1>
        </br>
        <p>Renode simulation is not running!</p>
      `;
    } else {
      this.getSensorsValues()
        .then(values => {
          if (values.length === 0) {
            this._view!.webview.html = `
              <style>${this.webviewStyles}</style>
              <h1>Sensors Data</h1>
              </br>
              <p>No sensors available!</p>
            `;
          } else {
            this._view!.webview.html = this.getHtmlForWebview(values);
          }
        })
        .catch(error => {
          console.error('Failed to load sensor values:', error);
          this._view!.webview.html = `
            <style>${this.webviewStyles}</style>
            <script>${this.webviewScript}</script>
            <h1>Sensors Data</h1>
            </br>
            <p>Error loading sensor data: ${error}</p>
            <button class="vscode-button" onclick="refresh()">Refresh All</button>
          `;
        });
    }
  }

  private getHtmlForWebview(sensorsData: any[]) {
    const sensorList = sensorsData
      ? sensorsData
          .map(
            data => `
            <li style="margin-bottom: 20px;">
              <strong>${this.prettifySensorName(data.sensorName)}</strong>
              <p>${data.type}: 
                <span id="${data.machine}-${data.sensorName}-${data.type}-value">${data.value} ${data.unit}</span>
              </p>
              <input type="number" id="${data.machine}-${data.sensorName}-${data.type}-input" placeholder="New value" />
              <button class="vscode-button" onclick="applyValue('${data.machine}', '${data.sensorName}', '${data.type}')">Apply</button>
            </li>
          `,
          )
          .join('')
      : '';

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sensors Data</title>
      <style>${this.webviewStyles}</style>
      <script>${this.webviewScript}</script>
      </head>
    <body>
      <h1>Sensors Data</h1>
      <ul>
        ${sensorList}
      </ul>
      <button class="vscode-button" onclick="refresh()">Refresh All</button>
    </body>
    </html>`;
  }

  private async getSensorsValues(): Promise<any[]> {
    let sensorsData: any[] = [];
    let machines = await this.renodeCtx.getMachines();

    for (const machine of machines) {
      let sensors = await this.renodeCtx.getSensors(machine);
      for (const sensor of sensors) {
        for (const type of sensor.types) {
          let sensorValues = await this.renodeCtx.getSensorValue(sensor, type);
          let data = {
            machine: machine,
            sensorName: sensor.name,
            type: type,
            value: sensorValues.value,
            unit: sensorValues.unit,
          };
          sensorsData.push(data);
        }
      }
    }
    return sensorsData;
  }

  private async updateSensorValue(
    machine: string,
    sensorName: string,
    type: string,
    newValue: string,
  ): Promise<void> {
    const sensorType = SensorTypeFromString(type);
    if (!sensorType) {
      throw new Error(`Invalid sensor type: ${type}`);
    }

    let newSensorValue: SensorValue;
    try {
      newSensorValue = GetSensorValue(sensorType, parseFloat(newValue), true);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to set sensor value: ${err}`);
      return;
    }

    const machines = await this.renodeCtx.getMachines();
    const targetMachine = machines.find(m => m === machine);

    if (!targetMachine) {
      throw new Error(`Machine not found: ${machine}`);
    }

    const sensors = await this.renodeCtx.getSensors(targetMachine);
    const targetSensor = sensors.find(sensor => sensor.name === sensorName);
    if (!targetSensor) {
      throw new Error(`Sensor not found: ${sensorName} on machine ${machine}`);
    }

    const isValidType = targetSensor.types.includes(sensorType);
    if (!isValidType) {
      throw new Error(`Sensor type not found: ${type} on sensor ${sensorName}`);
    }

    await this.renodeCtx.setSensorValue(
      targetSensor,
      sensorType,
      newSensorValue,
    );
  }
}
