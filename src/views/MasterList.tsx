import { gameSupported, nativePlugins } from '../util/gameSupport';

import * as React from 'react';
import { ListGroup, ListGroupItem } from 'react-bootstrap';
import { connect } from 'react-redux';

interface IBaseProps {
  masters: string[];
}

interface IConnectedProps {
  installedPlugins: Set<string>;
}

type IProps = IBaseProps & IConnectedProps;

class MasterList extends React.Component<IProps, {}> {
  constructor(props: IProps) {
    super(props);
  }

  public render(): JSX.Element {
    const { masters } = this.props;
    if (masters === undefined) {
      return null;
    }
    return (
      <ListGroup>
        {masters.map(this.renderPlugin)}
      </ListGroup>);
  }

  private renderPlugin = (pluginName: string): JSX.Element => {
    const { installedPlugins } = this.props;
    const isInstalled = installedPlugins.has(pluginName.toLowerCase());
    return (
      <ListGroupItem
        style={{ padding: 5 }}
        key={`plugin-${pluginName}`}
        bsStyle={isInstalled ? undefined : 'warning'}
      >
        {pluginName}
      </ListGroupItem>);
  }
}

function mapStateToProps(state: any): IConnectedProps {
  const pluginList = state.session.plugins.pluginList || {};
  const installedPlugins = new Set<string>(Object.keys(pluginList).map(key => key) || []);
  return {
    installedPlugins,
  };
}

export default connect(mapStateToProps)(MasterList) as React.ComponentClass<IBaseProps>;
