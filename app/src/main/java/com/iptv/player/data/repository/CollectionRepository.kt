package com.iptv.player.data.repository

import com.iptv.player.data.local.CollectionDao
import com.iptv.player.data.local.CollectionEntity
import com.iptv.player.data.local.CollectionItemDao
import com.iptv.player.data.local.CollectionItemEntity
import com.iptv.player.data.model.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

data class CollectionWithCount(
    val collection: CollectionEntity,
    val count: Int,
)

class CollectionRepository(
    private val collectionDao: CollectionDao,
    private val itemDao: CollectionItemDao,
) {
    val collections: Flow<List<CollectionWithCount>> =
        combine(collectionDao.observeAll(), itemDao.observeAll()) { cols, items ->
            val counts = items.groupingBy { it.collectionId }.eachCount()
            cols.map { CollectionWithCount(it, counts[it.id] ?: 0) }
        }

    fun items(collectionId: Long): Flow<List<CollectionItemEntity>> =
        itemDao.observeItems(collectionId)

    fun collectionsContaining(channelId: String): Flow<List<Long>> =
        itemDao.observeCollectionsFor(channelId)

    suspend fun createCollection(name: String): Long =
        collectionDao.insert(CollectionEntity(name = name.ifBlank { "Sin nombre" }))

    suspend fun rename(id: Long, name: String) =
        collectionDao.rename(id, name.ifBlank { "Sin nombre" })

    suspend fun deleteCollection(id: Long) {
        itemDao.clearCollection(id)
        collectionDao.delete(id)
    }

    suspend fun addChannel(collectionId: Long, channel: Channel) {
        itemDao.add(
            CollectionItemEntity(
                collectionId = collectionId,
                channelId = channel.id,
                name = channel.name,
                streamUrl = channel.streamUrl,
                logoUrl = channel.logoUrl,
                kindOrdinal = channel.kind.ordinal,
            )
        )
    }

    suspend fun removeChannel(collectionId: Long, channelId: String) =
        itemDao.remove(collectionId, channelId)
}
