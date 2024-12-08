import { Map as ImmutableMap } from 'immutable';
import {
  ALGORITHM_PREFERENCES_FETCH_SUCCESS,
  ALGORITHM_PREFERENCES_UPDATE,
} from '../actions/algorithm_preferences';

const initialState = ImmutableMap({
  boost_weight: 0.5,
  reply_weight: 0.5,
  media_weight: 0.5,
  favorite_weight: 0.5,
});

export default function algorithmPreferences(state = initialState, action) {
  switch(action.type) {
  case ALGORITHM_PREFERENCES_FETCH_SUCCESS:
    return ImmutableMap(action.preferences);
  case ALGORITHM_PREFERENCES_UPDATE:
    return state.merge(action.preferences);
  default:
    return state;
  }
}
