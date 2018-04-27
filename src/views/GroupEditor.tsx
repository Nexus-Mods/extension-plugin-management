import { addGroup, addGroupRule, removeGroup, removeGroupRule } from '../actions/userlist';
import { openGroupEditor } from '../actions/userlistEdit';
import { ILOOTGroup, ILOOTList } from '../types/ILOOTList';

import genGraphStyle from '../util/genGraphStyle';
import GraphView, { IGraphElement, IGraphSelection } from './GraphView';

import * as path from 'path';
import * as React from 'react';
import { Button } from 'react-bootstrap';
import { translate } from 'react-i18next';
import { connect } from 'react-redux';
import {} from 'redux-thunk';
import { actions, ComponentEx, Modal, selectors, types, util } from 'vortex-api';

// tslint:disable-next-line:no-var-requires
const { ContextMenu } = require('vortex-api');

interface IConnectedProps {
  open: boolean;
  userlist: ILOOTList;
  masterlist: ILOOTList;
}

interface IActionProps {
  onOpen: (open: boolean) => void;
  onAddGroup: (group: string) => void;
  onRemoveGroup: (group: string) => void;
  onAddGroupRule: (group: string, reference: string) => void;
  onRemoveGroupRule: (group: string, reference: string) => void;
  onShowDialog: (type: types.DialogType, title: string, content: types.IDialogContent,
                 actions: types.DialogActions) => Promise<types.IDialogResult>;
}

type IProps = IConnectedProps & IActionProps;

interface IComponentState {
  elements: { [id: string]: IGraphElement };
  context: {
    x: number,
    y: number,
    selection?: IGraphSelection,
  };
}

class GroupEditor extends ComponentEx<IProps, IComponentState> {
  private mHighlighted: { source: string, target: string };
  private mContextTime: number;

  private contextNodeActions = [
    {
      icon: '',
      title: 'Remove',
      show: true,
      action: () => this.removeSelection(),
    },
   ];

  private contextBGActions = [
    {
      icon: '',
      title: 'Add Group',
      show: true,
      action: () => this.addGroup(),
    },
  ];

  constructor(props: IProps) {
    super(props);
    this.initState({
      elements: this.genElements(props),
      context: undefined,
    });
  }

  public componentWillReceiveProps(newProps: IProps) {
    if ((this.props.userlist !== newProps.userlist)
        || (this.props.masterlist !== newProps.masterlist)) {
     this.nextState.elements = this.genElements(newProps);
    }
  }

  public render(): JSX.Element {
    const { t, open } = this.props;
    const { elements } = this.state;
    const sheet = this.getThemeSheet();
    let contextActions;
    if (this.state.context !== undefined) {
      contextActions = (this.state.context.selection !== undefined)
        ? this.contextNodeActions
        : this.contextBGActions;
    }
    return (
      <Modal
        id='plugin-group-editor'
        show={open}
        onHide={this.close}
      >
        <Modal.Header><Modal.Title>{t('Groups')}</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className='group-editor-usage'>
            <div>{t('Drag line from one group to another to define a rule.')}</div>
            <div>{t('Right click a line/node to remove the corresponding rule/group.')}</div>
            <div>{t('Right click empty area to create new Group.')}</div>
            <div>{t('Masterlist groups and rules can\'t be removed.')}</div>
          </div>
          <GraphView
            className='group-graph'
            elements={elements}
            visualStyle={genGraphStyle(sheet)}
            onConnect={this.connect}
            onDisconnect={this.disconnect}
            onRemove={this.props.onRemoveGroup}
            onContext={this.openContext}
          />
          <ContextMenu
            position={this.state.context}
            visible={this.state.context !== undefined}
            onHide={this.hideContext}
            instanceId={42}
            actions={contextActions}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>{t('Close')}</Button>
        </Modal.Footer>
      </Modal>
    );
  }

  private connect = (source: string, target: string) => {
    const { onAddGroup, onAddGroupRule, masterlist, userlist } = this.props;
    const masterExisting = masterlist.groups.find(grp => grp.name === target);
    if ((masterExisting !== undefined)
        && (userlist.groups.find(grp => grp.name === target) === undefined)) {
      // if the group is from the masterlist and doesn't exist in the userlist yet,
      // we have to transfer the existing rules, otherwise they will disappear, with
      // no good reason from the user perspective
      onAddGroup(target);
      (masterExisting.after || []).forEach(after => {
        onAddGroupRule(target, after);
      });
    }
    onAddGroupRule(target, source);
  }

  private disconnect = (source: string, target: string) => {
    const { onRemoveGroupRule } = this.props;
    onRemoveGroupRule(target, source);
  }

  private removeSelection = () => {
    const { id, source, target } = this.state.context.selection;
    if (id !== undefined) {
      // TODO: Need to remove this groups from all after rules in plugins and other groups!
      this.props.onRemoveGroup(id);
    } else {
      this.props.onRemoveGroupRule(target, source);
    }
  }

  private addGroup = () => {
    const { onAddGroup, onShowDialog } = this.props;
    onShowDialog('question', 'Add Group', {
      input: [
        { id: 'newGroup', value: '', label: 'Group Name' },
      ],
    }, [{ label: 'Cancel' }, { label: 'Add' }])
    .then((result: types.IDialogResult) => {
        if (result.action === 'Add') {
          onAddGroup(result.input.newGroup);
        }
      });
  }

  private openContext = (x: number, y: number, selection: IGraphSelection) => {
    this.nextState.context = { x, y, selection };
    this.mContextTime = Date.now();
  }

  private hideContext = () => {
    if (Date.now() - this.mContextTime < 20) {
      // workaround: somehow I can't prevent the event that opens the context menu from being
      // propagated up, which will be picked up as close event
      return;
    }
    this.nextState.context = undefined;
  }

  private getThemeSheet(): CSSStyleRule[] {
    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < document.styleSheets.length; ++i) {
      if ((document.styleSheets[i].ownerNode as any).id === 'theme') {
        return Array.from((document.styleSheets[i] as any).rules);
      }
    }
    return [];
  }

  private close = () => {
    const { onOpen } = this.props;
    onOpen(false);
  }

  private genElements(props: IProps): { [id: string]: IGraphElement } {
    const { masterlist, userlist } = props;

    return [].concat(
      masterlist.groups.map(group =>
        ({ title: group.name, connections: group.after, class: 'masterlist', readonly: true })),
      userlist.groups.map(group =>
        ({ title: group.name, connections: group.after, class: 'userlist' })),
    ).reduce((prev, ele) => {
      prev[ele.title] = ele;
      return prev;
    }, {});
  }
}

const emptyObj = {};
const emptyArr = [];

function mapStateToProps(state): IConnectedProps {
  return {
    open: state.session.pluginDependencies.groupEditorOpen,
    masterlist: state.masterlist,
    userlist: state.userlist,
  };
}

function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
  return {
    onOpen: (open: boolean) => dispatch(openGroupEditor(open)),
    onAddGroup: (groupId: string) =>
      dispatch(addGroup(groupId)),
    onRemoveGroup: (groupId: string) =>
      dispatch(removeGroup(groupId)),
    onAddGroupRule: (groupId: string, reference: string) =>
      dispatch(addGroupRule(groupId, reference)),
    onRemoveGroupRule: (groupId: string, reference: string) =>
      dispatch(removeGroupRule(groupId, reference)),
    onShowDialog: (type, title, content, dialogActions) =>
      dispatch((actions.showDialog as any)(type, title, content, dialogActions)),
  };
}

export default translate(['common'], {wait: false})(
  connect(mapStateToProps, mapDispatchToProps)(
    GroupEditor)) as React.ComponentClass<{}>;
