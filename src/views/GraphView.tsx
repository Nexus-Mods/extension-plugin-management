import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import edgehandles from 'cytoscape-edgehandles';
import * as React from 'react';
import { util } from 'vortex-api';

(cytoscape as any).use(edgehandles);
(cytoscape as any).use(coseBilkent);

const MAX_COLUMNS = 10;

export interface IConnectionGroup {
  class: string;
  connections: string[];
}

export interface IGraphElement {
  title: string;
  class: string;
  connections: IConnectionGroup[];
  readonly?: boolean;
}

export interface IGraphSelection {
  source?: string;
  target?: string;
  id?: string;
  readonly?: boolean;
}

export interface IGraphViewProps {
  elements: { [id: string]: IGraphElement };
  className: string;
  style?: any;
  visualStyle: any[];
  onConnect: (source: string, target: string) => void;
  onDisconnect: (source: string, target: string) => void;
  onRemove: (id: string) => void;
  onContext: (x: number, y: number, selection: IGraphSelection) => void;
}

function san(input: string): string {
  let res = input.replace(/[^a-zA-Z0-9_-]/g, (invalid) => `_${invalid.charCodeAt(0)}_`);
  if (!res) {
    // workaround so we can open the dialog even with an empty node name
    res = '__empty';
  }
  return res;
}

class GraphView extends React.Component<IGraphViewProps, {}> {
  private mGraph: cytoscape.Core;
  private mLayout: cytoscape.LayoutManipulation;
  private mEdgeHandler: any;
  private mMousePos: { x: number, y: number } = { x: 0, y: 0 };
  private mHoveredNode: any;

  public UNSAFE_componentWillReceiveProps(newProps: IGraphViewProps) {
    if (newProps.elements !== this.props.elements) {
      const changed = util.objDiff(this.props.elements, newProps.elements);

      Object.keys(changed).forEach(id => {
        if (id[0] === '+') {
          // node added
          this.mGraph.add({
            data: { id: san(id.slice(1)), title: changed[id].title } as any,
            classes: changed[id].class,
            position: this.mMousePos,
          });

          changed[id].connections.forEach(connGroup => {
            connGroup.connections.forEach(conn => {
              const from = san(id.slice(1));
              const to = san(conn);
              this.mGraph.add({
                data: {
                  id: `${from}-to-${to}`,
                  source: to,
                  sourceOrig: conn,
                  target: from,
                  targetOrig: id.slice(1),
                } as any,
                classes: connGroup.class,
              });
            });
          });
        } else if (id[0] === '-') {
          // node removed
          this.mGraph.remove('#' + san(id.slice(1)));
        } else {
          // updated classes
          const nodeId = san(id);
          if (this.props.elements[id].class !== newProps.elements[id].class) {
            this.mGraph.$(`node#${nodeId}, edge[target = "${nodeId}"]`)
              .removeClass(this.props.elements[id].class)
              .addClass(newProps.elements[id].class);
          }
          // node content changed
          Object.keys(changed[id].connections).forEach((connGroupIdx: string) => {
            const connGroup = changed[id].connections[connGroupIdx];
            Object.keys(connGroup.connections)
              .sort((lhs, rhs) => (lhs[0] !== rhs[0])
                ? lhs[0] === '-' ? -1 : 1
                : lhs.localeCompare(rhs))
              .forEach(refId => {
                const conn = connGroup.connections[refId];
                const from = san(id);
                const to = san(conn);
                const connId = `${from}-to-${to}`;
                if ((connGroupIdx[0] === '-') || (refId[0] === '-')) {
                  this.mGraph.remove('#' + connId);
                } else {
                  this.mGraph.add({
                    data: {
                      id: connId,
                      source: to,
                      sourceOrig: conn,
                      target: from,
                      targetOrig: id,
                    } as any,
                    classes: newProps.elements[id].connections[parseInt(connGroupIdx, 10)]?.class,
                  });
                }
              });
          });
        }
      });
    }
  }

  public layout() {
    this.mLayout.run();
  }

  public render(): JSX.Element {
    const { className, style } = this.props;

    return <div ref={this.setRef} className={className} style={style} />;
  }

  private onKeyDown = (evt: KeyboardEvent) => {
    if (evt.keyCode === 17) {
      this.mEdgeHandler.enable();
      if (this.mHoveredNode?.data?.()?.title !== undefined) {
        this.mEdgeHandler.show?.(this.mHoveredNode);
      }
      // this.mEdgeHandler.enableDrawMode();
    }
  }

  private onKeyUp = (evt: KeyboardEvent) => {
    if (evt.keyCode === 17) {
      // this.mEdgeHandler.disableDrawMode();
      this.mEdgeHandler.disable();
      this.mEdgeHandler.hide();
    }
  }

  private setRef = (ref: HTMLDivElement) => {
    const { className, elements, visualStyle } = this.props;
    if (ref === null) {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      (this.mGraph as any).off('cxttap', this.handleContext);
      (this.mGraph as any).off('ehcomplete', this.handleEHComplete);
      this.mGraph = undefined;
      return;
    }
    this.mGraph = cytoscape({
      container: ref,
      style: visualStyle,
      minZoom: 0.33,
      maxZoom: 3,
      wheelSensitivity: 0.1,
      boxSelectionEnabled: false,
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.addElements(elements);
    this.mGraph.resize();
    this.mGraph.center();
    this.mLayout = this.mGraph.layout({
      name: 'cose-bilkent',
      nodeDimensionsIncludeLabels: true,
      randomize: false,
    } as any);
    this.mLayout.run();
    this.mEdgeHandler = (this.mGraph as any).edgehandles({
      handlePosition: () => 'middle middle',
      edgeParams: () => ({ classes: className + '-edge' }),
      loopAllowed: () => false,
      hoverDelay: 0,
      snap: true,
    });
    this.mEdgeHandler.disable();
    this.mGraph.on('cxttap', this.handleContext);
    this.mGraph.on('mouseover', (evt: cytoscape.EventObject) => {
      this.mHoveredNode = evt.target;
    });
    this.mGraph.on('mouseout', () => this.mHoveredNode = undefined);
    this.mGraph.on('ehcomplete', this.handleEHComplete as any);
  }

  private handleContext = (evt: cytoscape.EventObject) => {
    let selection;
    if (evt.target.data !== undefined) {
      const data = evt.target.data();
      if (data.source !== undefined) {
        selection = { source: data.sourceOrig, target: data.targetOrig, readonly: data.readonly };
      } else if (data.title !== undefined) {
        selection = { id: data.title, readonly: data.readonly };
      }
    }
    this.mMousePos = evt.position;
    this.props.onContext(evt.renderedPosition.x, evt.renderedPosition.y, selection);
  }

  private handleEHComplete = (evt, source, target, added) => {
    this.props.onConnect(source.data().title, target.data().title);
    // remove the automatically created edge so we can add our own, in sync with the backend data
    if ((added.data() !== undefined) && (this.mGraph !== undefined)) {
      this.mGraph.remove('#' + added.data().id);
    }
  }

  private addElements(elements: { [id: string]: IGraphElement }) {
    const width = MAX_COLUMNS;
    const distance = (this.mGraph.width() / width) * 2;
    this.mGraph
      .add(Object.keys(elements).reduce((prev, id: string, idx: number) => {
        const ele = elements[id];
        const row = Math.floor(idx / width);
        const pos = (row % 2 === 0) ? (idx % width) : width - (idx % width);
        prev.push({
          data: { id: san(id), title: ele.title, readonly: ele.readonly },
          classes: ele.class,
          position: { x: pos * distance, y: row * distance },
        });

        (ele.connections || []).forEach(connGroup => {
          (connGroup.connections || []).forEach(conn => {
            if ((elements[id] === undefined) || (elements[conn] === undefined)) {
              // invalid connection, are connections out of sync with the nodes?
              return;
            }
            const from = san(id);
            const to = san(conn);
            prev.push({
              data: {
                id: `${from}-to-${to}`,
                source: to,
                sourceOrig: conn,
                target: from,
                targetOrig: id,
                readonly: ele.readonly,
              } as any,
              classes: connGroup.class,
            });
          });
        });

        return prev;
      }, []));
  }
}

export default GraphView;
