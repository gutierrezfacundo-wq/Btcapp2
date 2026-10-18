package com.iptv.player.ui.setup

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.iptv.player.R
import com.iptv.player.di.AppContainer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupScreen(
    container: AppContainer,
    onSaved: () -> Unit,
    onBack: (() -> Unit)? = null,
    editingId: Long? = null,
) {
    val vm: SetupViewModel = viewModel(factory = SetupViewModel.Factory(container))
    val state by vm.state.collectAsState()
    val editing = state.editing
    val isEdit = editing != null

    // Cargar la playlist a editar (una sola vez).
    LaunchedEffect(editingId) {
        if (editingId != null) vm.loadForEdit(editingId)
    }

    // Tab inicial segun el tipo de la playlist en edicion.
    var tab by rememberSaveable(editing?.id) {
        mutableStateOf(if (editing?.kind == "xtream") 1 else 0)
    }

    // Campos: si hay edicion, precargados; sino, vacios.
    var nameM3u by rememberSaveable(editing?.id) { mutableStateOf(if (editing?.kind == "m3u") editing.name else "") }
    var url by rememberSaveable(editing?.id) { mutableStateOf(editing?.m3uUrl.orEmpty()) }
    var epg by rememberSaveable(editing?.id) { mutableStateOf(editing?.epgUrl.orEmpty()) }
    var nameXt by rememberSaveable(editing?.id) { mutableStateOf(if (editing?.kind == "xtream") editing.name else "") }
    var server by rememberSaveable(editing?.id) { mutableStateOf(editing?.xServer.orEmpty()) }
    var user by rememberSaveable(editing?.id) { mutableStateOf(editing?.xUser.orEmpty()) }
    var pass by rememberSaveable(editing?.id) { mutableStateOf(editing?.xPass.orEmpty()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (isEdit) "Editar lista" else stringResource(R.string.setup_title))
                },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver")
                        }
                    }
                },
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text(stringResource(R.string.setup_tab_m3u)) })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text(stringResource(R.string.setup_tab_xtream)) })
            }
            Spacer(Modifier.height(16.dp))
            if (tab == 0) {
                OutlinedTextField(
                    value = nameM3u, onValueChange = { nameM3u = it },
                    label = { Text(stringResource(R.string.setup_playlist_name)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = url, onValueChange = { url = it },
                    label = { Text(stringResource(R.string.setup_m3u_url)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = epg, onValueChange = { epg = it },
                    label = { Text(stringResource(R.string.setup_epg_url)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = { vm.saveM3u(nameM3u.trim(), url.trim(), epg.trim().ifBlank { null }, onSaved) },
                    enabled = url.isNotBlank() && !state.saving,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.saving) CircularProgressIndicator(modifier = Modifier.height(20.dp))
                    else Text(if (isEdit) "Guardar cambios" else stringResource(R.string.setup_save))
                }
            } else {
                OutlinedTextField(
                    value = nameXt, onValueChange = { nameXt = it },
                    label = { Text(stringResource(R.string.setup_playlist_name)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = server, onValueChange = { server = it },
                    label = { Text(stringResource(R.string.setup_xtream_server)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = user, onValueChange = { user = it },
                    label = { Text(stringResource(R.string.setup_xtream_user)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = pass, onValueChange = { pass = it },
                    label = { Text(stringResource(R.string.setup_xtream_pass)) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = { vm.saveXtream(nameXt.trim(), server.trim(), user.trim(), pass, onSaved) },
                    enabled = server.isNotBlank() && user.isNotBlank() && pass.isNotBlank() && !state.saving,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.saving) CircularProgressIndicator(modifier = Modifier.height(20.dp))
                    else Text(if (isEdit) "Guardar cambios" else stringResource(R.string.setup_save))
                }
            }
            state.error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
